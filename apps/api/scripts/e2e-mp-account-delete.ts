/**
 * Dhenu account-deletion (Apple 5.1.1(v)) end-to-end against runq_dev.
 *
 * Proves DELETE /api/v1/milk-procurement/account for both app personas:
 *  - farmer: master anonymised + soft-deleted, credential revoked, membership
 *    closed, backing user anonymised, re-login blocked.
 *  - operator WITH payout history (the demo/reviewer account): operator row
 *    anonymised + deactivated, its mp_operator_payouts row RETAINED, re-login
 *    blocked. Financial history must NOT block deletion.
 *
 * Usage: tsx --env-file=../../.env apps/api/scripts/e2e-mp-account-delete.ts
 */

import {
  createDb, mpCredentials, mpFarmers, mpFarmerMemberships, mpNodes, mpNodeOperators,
  mpOperatorPayouts, users, userTenants, vendors,
} from '@runq/db';
import { and, eq, isNull } from 'drizzle-orm';
import { buildApp } from '../src/app';
import { FarmerService } from '../src/modules/milk-procurement/farmer.service';
import { mpOtpLogin } from './lib/mp-otp-login';

const TENANT_ID = '4ae78c54-aef4-46cb-9283-3db65edd076b'; // runq Demo Co
const F_CODE = 'E2E-DEL-F1';
const F_PHONE = '9876500011';
const OP_PHONE = '9876500022';
const NODE_CODE = 'E2E-DEL-NODE';

let pass = 0, fail = 0;
function check(label: string, ok: boolean, detail?: string): void {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
}

const del = (app: any, token: string) => app.inject({
  method: 'DELETE', url: '/api/v1/milk-procurement/account',
  headers: { authorization: `Bearer ${token}` },
});
const otpStatus = (app: any, phone: string) => app.inject({
  method: 'POST', url: '/api/v1/auth/mp/otp/request', payload: { phone },
});

// Tear down test rows via durable anchors (farmer code / node code), since a
// completed run tombstones phones + emails so they can't be found by value.
async function cleanup(db: any): Promise<void> {
  const userIds = new Set<string>();

  const [f] = await db.select({ id: mpFarmers.id, vendorId: mpFarmers.vendorId }).from(mpFarmers)
    .where(and(eq(mpFarmers.tenantId, TENANT_ID), eq(mpFarmers.code, F_CODE))).limit(1);
  if (f) {
    const creds = await db.select({ userId: mpCredentials.userId }).from(mpCredentials)
      .where(eq(mpCredentials.farmerId, f.id));
    for (const c of creds) if (c.userId) userIds.add(c.userId);
    await db.delete(mpCredentials).where(eq(mpCredentials.farmerId, f.id));
    await db.delete(mpFarmerMemberships).where(eq(mpFarmerMemberships.farmerId, f.id));
    await db.delete(mpFarmers).where(eq(mpFarmers.id, f.id));
    await db.delete(vendors).where(eq(vendors.id, f.vendorId));
  }

  const [node] = await db.select({ id: mpNodes.id }).from(mpNodes)
    .where(and(eq(mpNodes.tenantId, TENANT_ID), eq(mpNodes.code, NODE_CODE))).limit(1);
  if (node) {
    const ops = await db.select({ id: mpNodeOperators.id, userId: mpNodeOperators.userId })
      .from(mpNodeOperators).where(eq(mpNodeOperators.nodeId, node.id));
    for (const o of ops) {
      if (o.userId) userIds.add(o.userId);
      await db.delete(mpOperatorPayouts).where(eq(mpOperatorPayouts.operatorId, o.id));
    }
    await db.delete(mpNodeOperators).where(eq(mpNodeOperators.nodeId, node.id));
    await db.delete(mpNodes).where(eq(mpNodes.id, node.id));
  }

  for (const uid of userIds) {
    await db.delete(mpCredentials).where(eq(mpCredentials.userId, uid));
    await db.delete(userTenants).where(eq(userTenants.userId, uid));
    await db.delete(users).where(eq(users.id, uid));
  }
}

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL required');
  const { db, pool } = createDb(dbUrl);

  console.log('\n=== Dhenu account-deletion e2e ===\n');
  await cleanup(db);

  const app = await buildApp();
  await app.ready();
  try {
    const [node] = await db.insert(mpNodes)
      .values({ tenantId: TENANT_ID, code: NODE_CODE, name: 'E2E Delete VMCC', nodeType: 'vmcc' })
      .returning();

    // ── Farmer ────────────────────────────────────────────────────────────
    console.log('Farmer:');
    const farmer = await new FarmerService(db, TENANT_ID).create({
      code: F_CODE, name: 'E2E Delete Farmer', phone: F_PHONE, nodeId: node.id,
      isSociety: false, defaultMilkType: 'cow',
    } as any);
    const fLogin = await mpOtpLogin(app, F_PHONE);
    const fToken = (fLogin.json() as any)?.data?.token as string;
    check('farmer login → 200', fLogin.statusCode === 200, `got ${fLogin.statusCode}`);

    const fDel = await del(app, fToken);
    check('DELETE /account → 204', fDel.statusCode === 204, `got ${fDel.statusCode}`);

    const [fa] = await db.select().from(mpFarmers).where(eq(mpFarmers.id, farmer.id)).limit(1);
    check('farmer anonymised + soft-deleted',
      fa?.name === 'Deleted farmer' && fa?.phone === null && !fa?.isActive && !!fa?.deletedAt);
    const openMems = await db.select().from(mpFarmerMemberships)
      .where(and(eq(mpFarmerMemberships.farmerId, farmer.id), isNull(mpFarmerMemberships.leftOn)));
    check('active membership closed', openMems.length === 0);
    const [fc] = await db.select().from(mpCredentials).where(eq(mpCredentials.farmerId, farmer.id)).limit(1);
    check('credential revoked + phone tombstoned',
      !!fc && !fc.isActive && fc.phone.startsWith('deleted-'), fc?.phone);
    if (fc?.userId) {
      const [u] = await db.select().from(users).where(eq(users.id, fc.userId)).limit(1);
      check('backing user anonymised', !!u && !u.isActive && u.email.startsWith('deleted-'), u?.email);
    }
    const fRe = await otpStatus(app, F_PHONE);
    check('re-login blocked (otp 404)', fRe.statusCode === 404, `got ${fRe.statusCode}`);

    // ── Operator with payout history (the demo case) ──────────────────────
    console.log('\nOperator (with payout history):');
    await db.insert(mpCredentials).values({ tenantId: TENANT_ID, phone: OP_PHONE, role: 'field_operator' });
    await db.insert(mpNodeOperators).values({
      tenantId: TENANT_ID, nodeId: node.id, phone: OP_PHONE, name: 'E2E Operator',
      role: 'operator', compType: 'per_litre_commission', ratePerLitre: '1.00', effectiveFrom: '2026-01-01',
    });
    const oLogin = await mpOtpLogin(app, OP_PHONE);
    const oToken = (oLogin.json() as any)?.data?.token as string;
    check('operator login → 200', oLogin.statusCode === 200, `got ${oLogin.statusCode}`);

    const [op] = await db.select().from(mpNodeOperators)
      .where(and(eq(mpNodeOperators.nodeId, node.id), eq(mpNodeOperators.phone, OP_PHONE))).limit(1);
    await db.insert(mpOperatorPayouts).values({
      tenantId: TENANT_ID, operatorId: op.id, nodeId: node.id,
      periodStart: '2026-01-01', periodEnd: '2026-01-15', paidOn: '2026-01-16',
    });

    const oDel = await del(app, oToken);
    check('DELETE /account → 204 (history not blocking)', oDel.statusCode === 204, `got ${oDel.statusCode}`);
    const [opAfter] = await db.select().from(mpNodeOperators).where(eq(mpNodeOperators.id, op.id)).limit(1);
    check('operator anonymised + deactivated',
      !!opAfter && !opAfter.isActive && opAfter.phone === null && opAfter.name === 'Deleted operator');
    const payouts = await db.select().from(mpOperatorPayouts).where(eq(mpOperatorPayouts.operatorId, op.id));
    check('operator payout history RETAINED', payouts.length === 1, `${payouts.length} rows`);
    const oRe = await otpStatus(app, OP_PHONE);
    check('re-login blocked (otp 404)', oRe.statusCode === 404, `got ${oRe.statusCode}`);
  } finally {
    await cleanup(db);
    await app.close();
    await pool.end();
  }

  console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
