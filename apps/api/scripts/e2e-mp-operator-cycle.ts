/**
 * Dhenu VMCC-operator cycle authority — end-to-end against runq_dev.
 *
 * Proves a `field_operator` can run payout cycles ONLY for the nodes they're
 * assigned to: create → lock → pay a node-scoped cycle, but 403 on a foreign
 * node, 403 with no scope, 409 on an overlapping period, and a foreign cycle is
 * invisible. Ledger writes are likewise farmer-at-node scoped. All fixtures are
 * synthetic (E2E-OPCYC-*) and torn down in `finally`.
 *
 * Usage: tsx --env-file=../../.env apps/api/scripts/e2e-mp-operator-cycle.ts
 */

import {
  createDb, mpNodes, mpFarmers, mpFarmerMemberships, mpPours, mpPayoutCycles,
  mpPayoutLines, mpPayoutDeductions, mpFarmerLedger, mpNodeOperators,
  mpCredentials, users, userTenants, vendors, payments,
  journalEntries, journalLines,
} from '@runq/db';
import { and, eq, inArray } from 'drizzle-orm';
import { buildApp } from '../src/app';
import { NodeService } from '../src/modules/milk-procurement/node.service';
import { FarmerService } from '../src/modules/milk-procurement/farmer.service';
import { PayoutService } from '../src/modules/milk-procurement/payout.service';

const TENANT_ID = '4ae78c54-aef4-46cb-9283-3db65edd076b'; // runq Demo Co
const PHONE = '9876590001';
const SYNTH_EMAIL = `mp-${PHONE}@dhenu.local`;
const DOB_ISO = '1985-07-09';
const DOB_GOOD = '090785';
const DATE = '2020-01-05'; // synthetic period — no seeded cycle overlaps it
const TODAY = new Date().toISOString().slice(0, 10);
const NODE_A = 'E2E-OPCYC-A';
const NODE_B = 'E2E-OPCYC-B';
const FARMER_CODE = 'E2E-OPCYC-F';

let pass = 0, fail = 0;
function check(label: string, ok: boolean, detail?: string): void {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
}

async function cleanup(db: any): Promise<void> {
  const nodes = await db.select({ id: mpNodes.id }).from(mpNodes)
    .where(and(eq(mpNodes.tenantId, TENANT_ID), inArray(mpNodes.code, [NODE_A, NODE_B])));
  const nodeIds = nodes.map((n: any) => n.id);
  const farmers = await db.select({ id: mpFarmers.id, vendorId: mpFarmers.vendorId }).from(mpFarmers)
    .where(and(eq(mpFarmers.tenantId, TENANT_ID), eq(mpFarmers.code, FARMER_CODE)));
  const farmerIds = farmers.map((f: any) => f.id);

  // GL entries posted by the payout flow (P1.1) reference created_by users, so
  // they must be removed before the user — keyed by cycle id / farmer-ledger id.
  const cyc = nodeIds.length
    ? await db.select({ id: mpPayoutCycles.id }).from(mpPayoutCycles).where(inArray(mpPayoutCycles.scopeNodeId, nodeIds))
    : [];
  const led = farmerIds.length
    ? await db.select({ id: mpFarmerLedger.id }).from(mpFarmerLedger).where(inArray(mpFarmerLedger.farmerId, farmerIds))
    : [];
  const srcIds = [...cyc.map((c: any) => c.id), ...led.map((l: any) => l.id)];
  if (srcIds.length) {
    const jes = await db.select({ id: journalEntries.id }).from(journalEntries).where(and(
      eq(journalEntries.tenantId, TENANT_ID),
      inArray(journalEntries.sourceType, ['mp_payout_cycle', 'mp_payout_payment', 'mp_farmer_ledger']),
      inArray(journalEntries.sourceId, srcIds),
    ));
    const jeIds = jes.map((j: any) => j.id);
    if (jeIds.length) {
      // Break the cycle→JE FK before deleting the accrual JE.
      if (cyc.length) {
        await db.update(mpPayoutCycles).set({ journalEntryId: null })
          .where(inArray(mpPayoutCycles.id, cyc.map((c: any) => c.id)));
      }
      await db.delete(journalLines).where(inArray(journalLines.journalEntryId, jeIds));
      await db.delete(journalEntries).where(inArray(journalEntries.id, jeIds));
    }
  }

  if (nodeIds.length) {
    const cycles = await db.select({ id: mpPayoutCycles.id }).from(mpPayoutCycles)
      .where(inArray(mpPayoutCycles.scopeNodeId, nodeIds));
    const cycleIds = cycles.map((c: any) => c.id);
    if (cycleIds.length) {
      const lines = await db.select({ id: mpPayoutLines.id, paymentId: mpPayoutLines.paymentId })
        .from(mpPayoutLines).where(inArray(mpPayoutLines.payoutCycleId, cycleIds));
      const lineIds = lines.map((l: any) => l.id);
      const paymentIds = lines.map((l: any) => l.paymentId).filter(Boolean);
      if (lineIds.length) await db.delete(mpPayoutDeductions).where(inArray(mpPayoutDeductions.payoutLineId, lineIds));
      await db.delete(mpPayoutLines).where(inArray(mpPayoutLines.payoutCycleId, cycleIds));
      await db.delete(mpPayoutCycles).where(inArray(mpPayoutCycles.id, cycleIds));
      if (paymentIds.length) await db.delete(payments).where(inArray(payments.id, paymentIds));
    }
    await db.delete(mpNodeOperators).where(inArray(mpNodeOperators.nodeId, nodeIds));
    await db.delete(mpPours).where(inArray(mpPours.nodeId, nodeIds));
  }
  if (farmerIds.length) await db.delete(mpFarmerLedger).where(inArray(mpFarmerLedger.farmerId, farmerIds));
  if (nodeIds.length) await db.delete(mpFarmerMemberships).where(inArray(mpFarmerMemberships.nodeId, nodeIds));
  for (const f of farmers) {
    await db.delete(mpFarmers).where(eq(mpFarmers.id, f.id));
    await db.delete(vendors).where(eq(vendors.id, f.vendorId));
  }
  if (nodeIds.length) await db.delete(mpNodes).where(inArray(mpNodes.id, nodeIds));
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, SYNTH_EMAIL)).limit(1);
  if (u) {
    // Drop any JEs this user authored (incl. orphans from earlier failed runs).
    const jes = await db.select({ id: journalEntries.id }).from(journalEntries).where(eq(journalEntries.createdBy, u.id));
    const jeIds = jes.map((j: any) => j.id);
    if (jeIds.length) {
      await db.delete(journalLines).where(inArray(journalLines.journalEntryId, jeIds));
      await db.delete(journalEntries).where(inArray(journalEntries.id, jeIds));
    }
    await db.delete(userTenants).where(eq(userTenants.userId, u.id));
    await db.update(mpCredentials).set({ userId: null }).where(eq(mpCredentials.userId, u.id));
  }
  await db.delete(mpCredentials).where(and(eq(mpCredentials.tenantId, TENANT_ID), eq(mpCredentials.phone, PHONE)));
  if (u) await db.delete(users).where(eq(users.id, u.id));
}

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL required');
  const { db, pool } = createDb(dbUrl);

  console.log('\n=== Dhenu VMCC-operator cycle authority e2e ===\n');
  await cleanup(db);

  const app = await buildApp();
  await app.ready();
  try {
    // ── Fixtures ────────────────────────────────────────────────────────────
    const nodeSvc = new NodeService(db, TENANT_ID);
    const nodeA = await nodeSvc.create({ code: NODE_A, name: 'OpCyc VMCC A', nodeType: 'vmcc',
      hasBmc: false, payoutMode: 'direct_to_farmer' } as any);
    const nodeB = await nodeSvc.create({ code: NODE_B, name: 'OpCyc VMCC B', nodeType: 'vmcc',
      hasBmc: false, payoutMode: 'direct_to_farmer' } as any);
    const farmer = await new FarmerService(db, TENANT_ID).create({ code: FARMER_CODE,
      name: 'OpCyc Farmer', isSociety: false, defaultMilkType: 'cow', nodeId: nodeA.id } as any);
    // a recorded pour at node A drives the cycle aggregation
    // one recorded pour per node — distinct shifts dodge the active-slot unique
    // index (tenant, farmer, date, shift).
    for (const [nodeId, shift] of [[nodeA.id, 'am'], [nodeB.id, 'pm']] as const) {
      await db.insert(mpPours).values({
        tenantId: TENANT_ID, nodeId, farmerId: farmer.id, collectionDate: DATE, shift,
        milkType: 'cow', qtyLitres: '10', fat: '4', snf: '8.5', qualityGrade: 'a', ratePerLitre: '30',
        baseAmount: '300', bonusAmount: '0', lineAmount: '300', status: 'recorded',
      });
    }

    // operator logs in (mints the user), then we attach them to node A
    await db.insert(mpCredentials).values({
      tenantId: TENANT_ID, phone: PHONE, dateOfBirth: DOB_ISO, role: 'field_operator',
    });
    const login = await app.inject({ method: 'POST', url: '/api/v1/auth/mp/phone-dob/login',
      payload: { phone: PHONE, dob: DOB_GOOD } });
    const token = (login.json() as any)?.data?.token as string;
    check('operator login → 200', login.statusCode === 200, `got ${login.statusCode}`);
    check('operator role = field_operator', (login.json() as any)?.data?.user?.role === 'field_operator');
    const [cred] = await db.select({ userId: mpCredentials.userId }).from(mpCredentials)
      .where(and(eq(mpCredentials.tenantId, TENANT_ID), eq(mpCredentials.phone, PHONE))).limit(1);
    await db.insert(mpNodeOperators).values({ tenantId: TENANT_ID, nodeId: nodeA.id, userId: cred.userId,
      role: 'operator', compType: 'per_litre_commission', ratePerLitre: '0.5', effectiveFrom: TODAY });

    const auth = { authorization: `Bearer ${token}` };
    const post = (url: string, payload?: any) => app.inject({ method: 'POST', url: `/api/v1/milk-procurement${url}`, headers: auth, payload });
    const get = (url: string) => app.inject({ method: 'GET', url: `/api/v1/milk-procurement${url}`, headers: auth });

    // ── Guards ────────────────────────────────────────────────────────────────
    const noScope = await post('/payouts/cycles', { periodStart: DATE, periodEnd: DATE });
    check('create with no scope → 403', noScope.statusCode === 403, `got ${noScope.statusCode}`);

    const foreign = await post('/payouts/cycles', { scopeNodeId: nodeB.id, periodStart: DATE, periodEnd: DATE });
    check('create for foreign node → 403', foreign.statusCode === 403, `got ${foreign.statusCode}`);

    const badLedger = await post('/payouts/ledger', {
      farmerId: '00000000-0000-0000-0000-000000000000', entryType: 'advance_given', amount: 100, occurredOn: TODAY });
    check('ledger for non-node farmer → 403', badLedger.statusCode === 403, `got ${badLedger.statusCode}`);

    // ── Happy path: create → lock → pay for the OWNED node ─────────────────────
    const created = await post('/payouts/cycles', { scopeNodeId: nodeA.id, periodStart: DATE, periodEnd: DATE });
    const cycleId = (created.json() as any)?.data?.id as string;
    check('create for owned node → 201', created.statusCode === 201, `got ${created.statusCode}`);
    check('cycle scoped to node A', (created.json() as any)?.data?.scopeNodeId === nodeA.id);

    const overlap = await post('/payouts/cycles', { scopeNodeId: nodeA.id, periodStart: DATE, periodEnd: DATE });
    check('overlapping cycle → 409', overlap.statusCode === 409, `got ${overlap.statusCode}`);

    const ownLedger = await post('/payouts/ledger', {
      farmerId: farmer.id, entryType: 'advance_given', amount: 50, occurredOn: TODAY });
    check('ledger for own-node farmer → 201', ownLedger.statusCode === 201, `got ${ownLedger.statusCode}`);

    const locked = await post(`/payouts/cycles/${cycleId}/lock`);
    check('lock owned cycle → 200', locked.statusCode === 200, `got ${locked.statusCode}`);
    const paid = await post(`/payouts/cycles/${cycleId}/pay`);
    check('pay owned cycle → 200', paid.statusCode === 200, `got ${paid.statusCode}`);
    check('cycle status now paid', (paid.json() as any)?.data?.status === 'paid');

    // ── Foreign cycle is invisible to the operator ────────────────────────────
    const bCycle = await new PayoutService(db, TENANT_ID).createCycle({
      scopeNodeId: nodeB.id, periodStart: DATE, periodEnd: DATE }).catch(() => null);
    if (bCycle) {
      const getForeign = await get(`/payouts/cycles/${bCycle.id}`);
      check('GET foreign cycle → 403', getForeign.statusCode === 403, `got ${getForeign.statusCode}`);
    } else {
      check('GET foreign cycle → 403', false, 'could not seed node-B cycle (no pours)');
    }

    const list = await get('/payouts/cycles');
    const rows: any[] = (list.json() as any)?.data ?? [];
    check('list shows only owned-node cycles',
      rows.length > 0 && rows.every((r) => r.scopeNodeId === nodeA.id),
      `n=${rows.length}`);
  } finally {
    await cleanup(db);
    await app.close();
    await pool.end();
  }

  console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
