/**
 * runq mobile — reviewer demo login + account deletion e2e against runq_dev.
 *
 * Seeds a throwaway employee in the `runq-demo` review tenant, then:
 *  - demo login: /otp/request returns the seeded DOB code (no SMS), /phone/login
 *    accepts it (App Store / Play reviewer path), wrong code is rejected.
 *  - account deletion (5.1.1(v)): DELETE /account revokes access; the session
 *    can no longer reach /auth/me, and the backing user is deactivated.
 * All fixtures (and anything login provisioned) are removed in a finally block.
 *
 * Usage: tsx --env-file=../../.env apps/api/scripts/e2e-hr-account.ts
 */

import { createDb, tenants, employees, users, userTenants } from '@runq/db';
import { eq, sql } from 'drizzle-orm';
import { buildApp } from '../src/app';

const DEMO_SLUG = 'runq-demo';
const PHONE = '9000000123';        // throwaway demo number
const DOB = '1990-01-01';          // -> code 010190
const DOB_CODE = '010190';

let pass = 0, fail = 0;
function check(label: string, ok: boolean, detail?: string): void {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
}

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL required');
  const { db, pool } = createDb(dbUrl);

  console.log('\n=== runq demo-login + account-deletion e2e ===\n');

  // ── Seed fixtures ────────────────────────────────────────────────────────
  let createdTenant = false;
  let [tenant] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, DEMO_SLUG)).limit(1);
  if (!tenant) {
    [tenant] = await db.insert(tenants).values({ name: 'runQ Demo', slug: DEMO_SLUG }).returning({ id: tenants.id });
    createdTenant = true;
  }
  const [emp] = await db.insert(employees).values({
    tenantId: tenant.id,
    employeeCode: `DEMO-${PHONE}`,
    firstName: 'Demo',
    joiningDate: '2024-01-01',
    phone: PHONE,
    dateOfBirth: DOB,
  }).returning({ id: employees.id });

  const app = await buildApp();
  await app.ready();
  let provisionedUserId: string | undefined;

  try {
    // ── Demo login: request returns the DOB code, no SMS ───────────────────
    const req = await app.inject({ method: 'POST', url: '/api/v1/auth/otp/request', payload: { phone: PHONE } });
    check('otp/request → 200', req.statusCode === 200, `got ${req.statusCode}`);
    check('demo devCode == DOB code', req.json().data?.devCode === DOB_CODE, req.json().data?.devCode);

    const bad = await app.inject({ method: 'POST', url: '/api/v1/auth/phone/login', payload: { phone: PHONE, otp: '111111' } });
    check('wrong demo code → 401', bad.statusCode === 401, `got ${bad.statusCode}`);

    const login = await app.inject({ method: 'POST', url: '/api/v1/auth/phone/login', payload: { phone: PHONE, otp: DOB_CODE } });
    check('demo login → 200', login.statusCode === 200, `got ${login.statusCode}`);
    const token = login.json().data?.token as string | undefined;
    check('token issued', !!token);
    provisionedUserId = login.json().data?.user?.id as string | undefined;

    // ── Account deletion revokes access ────────────────────────────────────
    if (token) {
      const auth = { authorization: `Bearer ${token}` };
      const me1 = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: auth });
      check('me works before delete', me1.statusCode === 200, `got ${me1.statusCode}`);

      const del = await app.inject({ method: 'DELETE', url: '/api/v1/account', headers: auth });
      check('DELETE /account → 204', del.statusCode === 204, `got ${del.statusCode}`);

      const me2 = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: auth });
      check('me blocked after delete', me2.statusCode >= 400, `got ${me2.statusCode}`);

      if (provisionedUserId) {
        const [u] = await db.select({ isActive: users.isActive }).from(users).where(eq(users.id, provisionedUserId)).limit(1);
        check('backing user deactivated', u?.isActive === false, `isActive=${u?.isActive}`);
      }
    }
  } finally {
    await app.close();
    if (provisionedUserId) {
      await db.delete(userTenants).where(eq(userTenants.userId, provisionedUserId));
      await db.delete(users).where(eq(users.id, provisionedUserId));
    }
    await db.delete(employees).where(eq(employees.id, emp.id));
    if (createdTenant) await db.delete(tenants).where(eq(tenants.id, tenant.id));
    await pool.end();
  }

  console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed\n`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
