/**
 * Provision a PERSISTENT Dhenu VMCC-operator login for manual app testing.
 *
 * Binds a phone credential to a real seeded VMCC node and attaches the
 * minted user to that node (mp_node_operators) so access-scope grants it. Safe
 * to re-run (idempotent). Unlike the e2e scripts, it does NOT tear down.
 *
 * Usage: tsx --env-file=../../.env apps/api/scripts/provision-mp-operator.ts [NODE_CODE]
 *        (NODE_CODE defaults to VMCC1 — "Kadod VMCC", which has 3 farmers)
 */

import { createDb, mpNodes, mpNodeOperators, mpCredentials } from '@runq/db';
import { and, eq } from 'drizzle-orm';
import { buildApp } from '../src/app';
import { mpOtpLogin } from './lib/mp-otp-login';

const NODE_CODE = process.argv[2] || 'VMCC1';
const PHONE = '9899000001';
const TODAY = new Date().toISOString().slice(0, 10);

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL required');
  const { db, pool } = createDb(dbUrl);

  const [node] = await db.select().from(mpNodes).where(eq(mpNodes.code, NODE_CODE)).limit(1);
  if (!node) throw new Error(`No node with code ${NODE_CODE}`);
  const tenantId = node.tenantId;

  // 1. Ensure a field_operator credential for this node's tenant.
  const [existing] = await db.select().from(mpCredentials)
    .where(and(eq(mpCredentials.tenantId, tenantId), eq(mpCredentials.phone, PHONE))).limit(1);
  if (!existing) {
    await db.insert(mpCredentials).values({
      tenantId, phone: PHONE, role: 'field_operator',
    });
  } else {
    await db.update(mpCredentials).set({ role: 'field_operator', bindAttempts: 0 })
      .where(eq(mpCredentials.id, existing.id));
  }

  // 2. Log in through the real endpoint → mints + links the user.
  const app = await buildApp();
  await app.ready();
  try {
    const res = await mpOtpLogin(app, PHONE);
    if (res.statusCode !== 200) throw new Error(`login failed ${res.statusCode}: ${res.body}`);
    const [cred] = await db.select({ userId: mpCredentials.userId }).from(mpCredentials)
      .where(and(eq(mpCredentials.tenantId, tenantId), eq(mpCredentials.phone, PHONE))).limit(1);

    // 3. Attach the user to the node (idempotent).
    const [link] = await db.select({ id: mpNodeOperators.id }).from(mpNodeOperators)
      .where(and(
        eq(mpNodeOperators.tenantId, tenantId), eq(mpNodeOperators.nodeId, node.id),
        eq(mpNodeOperators.userId, cred.userId!), eq(mpNodeOperators.isActive, true),
      )).limit(1);
    if (!link) {
      await db.insert(mpNodeOperators).values({
        tenantId, nodeId: node.id, userId: cred.userId, role: 'operator',
        compType: 'per_litre_commission', ratePerLitre: '0.50', effectiveFrom: TODAY,
      });
    }

    console.log('\n✅ VMCC operator ready — sign in on the Dhenu app with:');
    console.log(`     Phone : ${PHONE}  (request an OTP; dev logs the code)`);
    console.log(`     Node  : ${node.name} (${node.code})`);
    console.log(`     Tenant: ${tenantId}\n`);
  } finally {
    await app.close();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
