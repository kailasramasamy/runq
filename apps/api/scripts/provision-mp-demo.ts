/**
 * Provision a PERSISTENT, self-contained Dhenu demo world for Google app review.
 *
 * Builds an isolated demo in the "runq Demo Co" tenant (never the live customer):
 *   • one VMCC node (cow_a1, analyzer/FAT-SNF)
 *   • an active flat rate chart + quality bonus so LIVE pour entry in the app
 *     prices correctly (no "no active rate chart" error for the reviewer)
 *   • three farmers attached to the node
 *   • 7 days of AM/PM pours so collection screens look alive
 *   • one paid payout cycle (oldest window) so the payments screen isn't empty
 *   • a field_operator login (phone + fixed demo OTP) attached to the node
 *
 * Idempotent and non-destructive to anything but its own demo pours (which are
 * rebuilt each run so the dates stay recent). Safe to re-run before review.
 *
 * Usage: DATABASE_URL=<prod-url> tsx apps/api/scripts/provision-mp-demo.ts
 */

import {
  createDb, mpNodes, mpFarmers, mpRateCharts, mpCredentials, mpNodeOperators,
  mpPours, users,
} from '@runq/db';
import { and, eq, inArray } from 'drizzle-orm';
import { buildApp } from '../src/app';
import { mpOtpLogin } from './lib/mp-otp-login';
import { NodeService } from '../src/modules/milk-procurement/node.service';
import { FarmerService } from '../src/modules/milk-procurement/farmer.service';
import { RateChartService } from '../src/modules/milk-procurement/rate-chart.service';
import { PayoutService } from '../src/modules/milk-procurement/payout.service';

const TENANT_ID = '4ae78c54-aef4-46cb-9283-3db65edd076b'; // runq Demo Co

const NODE_CODE = 'DEMO-VMCC';
const MILK_TYPE = 'cow_a1' as const;

// Reviewer sign-in: phone + the seeded DOB code. The demo credential carries a
// date_of_birth; the server accepts its DDMMYY form as the login code — for the
// runq-demo tenant only (see mp-auth.routes.ts). No SMS, no env config.
const OPERATOR_PHONE = '9000000001';
const DEMO_DOB = '1990-01-01';
const DEMO_OTP = '010190'; // DDMMYY(DEMO_DOB) — the code the reviewer types.

const FARMERS = [
  { code: 'DEMO-F1', name: 'Ramesh Gowda', phone: '9000000011' },
  { code: 'DEMO-F2', name: 'Lakshmi Devi', phone: '9000000012' },
  { code: 'DEMO-F3', name: 'Suresh Kumar', phone: '9000000013' },
];

const BASE_RATE = 32; // flat per-litre; quality bonus added on top
const BONUS = { a: 4, b: 2, c: 0 } as const;

const today = new Date();
const isoDay = (offset: number): string => {
  const d = new Date(today);
  d.setDate(d.getDate() - offset);
  return d.toISOString().slice(0, 10);
};
const TODAY = isoDay(0);

// Indian FY (Apr–Mar) label for receipt numbers, e.g. 2026-27.
const fyLabel = (iso: string): string => {
  const [y, m] = iso.split('-').map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
};

const grade = (fat: number, snf: number): 'a' | 'b' | 'c' =>
  fat >= 4.0 && snf >= 8.5 ? 'a' : fat >= 3.5 && snf >= 8.0 ? 'b' : 'c';
const r2 = (n: number): string => n.toFixed(2);

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL required');
  const { db, pool } = createDb(dbUrl);

  const app = await buildApp();
  await app.ready();
  try {
    // 1. VMCC node (idempotent by code) ──────────────────────────────────────
    let [node] = await db.select().from(mpNodes)
      .where(and(eq(mpNodes.tenantId, TENANT_ID), eq(mpNodes.code, NODE_CODE))).limit(1);
    if (!node) {
      node = await new NodeService(db, TENANT_ID).create({
        code: NODE_CODE, name: 'Demo Dairy VMCC', nodeType: 'vmcc', hasBmc: false,
        measurementMode: 'analyzer', allowedMilkTypes: [MILK_TYPE], defaultMilkType: MILK_TYPE,
        payoutMode: 'direct_to_farmer', city: 'Bengaluru', state: 'Karnataka',
      } as any) as any;
    }
    console.log(`• node ${node.code} (${node.id})`);

    // 2. Active flat rate chart + quality bonus → live pour entry prices ──────
    const [chart] = await db.select().from(mpRateCharts).where(and(
      eq(mpRateCharts.tenantId, TENANT_ID), eq(mpRateCharts.milkType, MILK_TYPE),
      eq(mpRateCharts.isActive, true),
    )).limit(1);
    if (!chart) {
      await new RateChartService(db, TENANT_ID).create({
        name: 'Demo cow A1 rate', milkType: MILK_TYPE, pricingMode: 'flat',
        flatRatePerLitre: BASE_RATE, effectiveFrom: '2020-01-01', cells: [],
        rules: [
          { ruleType: 'quality_bonus', grade: 'a', bonusPerLitre: BONUS.a },
          { ruleType: 'quality_bonus', grade: 'b', bonusPerLitre: BONUS.b },
          { ruleType: 'quality_bonus', grade: 'c', bonusPerLitre: BONUS.c },
        ],
      } as any);
    }
    console.log('• rate chart ready');

    // 3. Farmers attached to the node (idempotent by code) ───────────────────
    const farmerSvc = new FarmerService(db, TENANT_ID);
    const farmerIds: string[] = [];
    for (const f of FARMERS) {
      let [row] = await db.select({ id: mpFarmers.id }).from(mpFarmers)
        .where(and(eq(mpFarmers.tenantId, TENANT_ID), eq(mpFarmers.code, f.code))).limit(1);
      if (!row) {
        const created = await farmerSvc.create({
          code: f.code, name: f.name, phone: f.phone, isSociety: false,
          defaultMilkType: MILK_TYPE, nodeId: node.id,
        } as any);
        row = { id: created.id };
      }
      farmerIds.push(row.id);
    }
    console.log(`• ${farmerIds.length} farmers`);

    // 4. Operator credential + login (mints the runq user) + node link ───────
    const [existingCred] = await db.select().from(mpCredentials)
      .where(and(eq(mpCredentials.tenantId, TENANT_ID), eq(mpCredentials.phone, OPERATOR_PHONE))).limit(1);
    if (!existingCred) {
      await db.insert(mpCredentials).values({
        tenantId: TENANT_ID, phone: OPERATOR_PHONE, role: 'field_operator', dateOfBirth: DEMO_DOB,
      });
    } else {
      await db.update(mpCredentials)
        .set({ role: 'field_operator', bindAttempts: 0, isActive: true, dateOfBirth: DEMO_DOB })
        .where(eq(mpCredentials.id, existingCred.id));
    }
    const login = await mpOtpLogin(app, OPERATOR_PHONE);
    if (login.statusCode !== 200) throw new Error(`operator login failed ${login.statusCode}: ${login.body}`);
    const operatorUserId = (login.json() as any)?.data?.user?.id as string;

    const [link] = await db.select({ id: mpNodeOperators.id }).from(mpNodeOperators).where(and(
      eq(mpNodeOperators.tenantId, TENANT_ID), eq(mpNodeOperators.nodeId, node.id),
      eq(mpNodeOperators.userId, operatorUserId),
    )).limit(1);
    if (!link) {
      await db.insert(mpNodeOperators).values({
        tenantId: TENANT_ID, nodeId: node.id, userId: operatorUserId, role: 'operator',
        compType: 'per_litre_commission', ratePerLitre: '0.50', effectiveFrom: TODAY,
      });
    }
    console.log(`• operator linked (user ${operatorUserId})`);

    // 5. Rebuild 7 days of AM/PM pours (delete demo-node pours first) ─────────
    await db.delete(mpPours).where(eq(mpPours.nodeId, node.id));
    const fats = [4.2, 3.8, 4.0, 3.6, 4.4, 3.9];
    const snfs = [8.6, 8.4, 8.7, 8.2, 8.5, 8.3];
    const qtys = [10.5, 8.0, 12.0, 9.5, 11.0, 7.5];
    let seq = 0;
    const rows: (typeof mpPours.$inferInsert)[] = [];
    for (let day = 6; day >= 0; day--) {
      const date = isoDay(day);
      for (let fi = 0; fi < farmerIds.length; fi++) {
        for (const shift of ['am', 'pm'] as const) {
          const k = (fi + day + (shift === 'pm' ? 1 : 0)) % 6;
          const fat = fats[k], snf = snfs[k];
          const qty = qtys[k] - (shift === 'pm' ? 1 : 0);
          const g = grade(fat, snf);
          const rate = BASE_RATE + BONUS[g];
          seq++;
          rows.push({
            tenantId: TENANT_ID, nodeId: node.id, farmerId: farmerIds[fi],
            collectionDate: date, shift, milkType: MILK_TYPE,
            qtyLitres: r2(qty), fat: r2(fat), snf: r2(snf), qualityGrade: g,
            ratePerLitre: r2(rate),
            baseAmount: r2(qty * BASE_RATE), bonusAmount: r2(qty * BONUS[g]), lineAmount: r2(qty * rate),
            receiptNo: `RCP/${fyLabel(date)}/${String(seq).padStart(5, '0')}`,
            recordedBy: operatorUserId, status: 'recorded',
          });
        }
      }
    }
    await db.insert(mpPours).values(rows);
    console.log(`• ${rows.length} pours seeded (${isoDay(6)} … ${TODAY})`);

    // 6. One paid payout cycle over the oldest window (days 6–4) so the
    //    payments screen shows a settled cycle; recent days stay pending. ─────
    const payout = new PayoutService(db, TENANT_ID);
    try {
      const cycle = await payout.createCycle({
        scopeNodeId: node.id, periodStart: isoDay(6), periodEnd: isoDay(4),
      } as any);
      await payout.lockCycle(cycle.id);
      await payout.payCycle(cycle.id, undefined, operatorUserId);
      console.log(`• paid cycle ${cycle.cycleNo ?? cycle.id} (${isoDay(6)}–${isoDay(4)})`);
    } catch (e) {
      console.warn(`• payout cycle skipped: ${(e as Error).message}`);
    }

    console.log('\n✅ Dhenu demo ready — Google reviewer signs in on the app with:');
    console.log(`     Phone       : ${OPERATOR_PHONE}`);
    console.log(`     Demo OTP    : ${DEMO_OTP}  (seeded as DOB ${DEMO_DOB} on the demo credential; no env needed)`);
    console.log(`     Role        : VMCC operator @ Demo Dairy VMCC`);
    console.log(`     Tenant      : runq Demo Co\n`);
  } finally {
    await app.close();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
