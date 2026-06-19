/**
 * Dhenu independent auth — end-to-end against runq_dev.
 *
 * Exercises the phone + DOB path of the mp-auth module (the social paths need a
 * real Firebase token → device-verified). Asserts the minted user is a `farmer`
 * whose effective module access is exactly `milk_procurement`, plus the DOB
 * throttle. Resolves identity via `mp_credentials` only — never `employees`.
 *
 * Usage: tsx --env-file=../../.env apps/api/scripts/e2e-mp-auth.ts
 */

import { createDb, mpCredentials, users, userTenants } from '@runq/db';
import { and, eq } from 'drizzle-orm';
import { buildApp } from '../src/app';

// runq Demo Co + farmer Ramesh Patel (seeded in runq_dev).
const TENANT_ID = '4ae78c54-aef4-46cb-9283-3db65edd076b';
const FARMER_ID = '57c3ae29-c4b9-4ac5-8bb3-30166a1a4779';
const PHONE = '9876500000';
const SYNTH_EMAIL = `mp-${PHONE}@dhenu.local`;
const DOB_ISO = '1990-05-15';
const DOB_GOOD = '150590'; // DDMMYY
const DOB_BAD = '010100';

let pass = 0, fail = 0;
function check(label: string, ok: boolean, detail?: string): void {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
}

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL required');
  const { db, pool } = createDb(dbUrl);

  console.log('\n=== Dhenu mp-auth e2e (phone + DOB) ===\n');

  // ── Reset fixture (idempotent) ───────────────────────────────────────────
  const [existingUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, SYNTH_EMAIL)).limit(1);
  if (existingUser) {
    await db.delete(userTenants).where(eq(userTenants.userId, existingUser.id));
    await db.update(mpCredentials).set({ userId: null }).where(eq(mpCredentials.userId, existingUser.id));
    await db.delete(users).where(eq(users.id, existingUser.id));
  }
  await db.delete(mpCredentials).where(and(eq(mpCredentials.tenantId, TENANT_ID), eq(mpCredentials.phone, PHONE)));
  await db.insert(mpCredentials).values({
    tenantId: TENANT_ID, phone: PHONE, dateOfBirth: DOB_ISO, role: 'farmer', farmerId: FARMER_ID,
  });

  const app = await buildApp();
  await app.ready();

  const login = (dob: string) => app.inject({
    method: 'POST', url: '/api/v1/auth/mp/phone-dob/login', payload: { phone: PHONE, dob },
  });

  try {
    // 1. Wrong DOB → 401, attempt counted.
    const bad = await login(DOB_BAD);
    check('wrong DOB rejected 401', bad.statusCode === 401, `got ${bad.statusCode}`);
    const [afterBad] = await db.select({ n: mpCredentials.bindAttempts }).from(mpCredentials)
      .where(and(eq(mpCredentials.tenantId, TENANT_ID), eq(mpCredentials.phone, PHONE))).limit(1);
    check('bind_attempts incremented to 1', afterBad?.n === 1, `n=${afterBad?.n}`);

    // 2. Correct DOB → 200, mints a farmer user + JWT.
    const ok = await login(DOB_GOOD);
    const okBody = ok.json() as any;
    const token = okBody?.data?.token as string | undefined;
    check('correct DOB → 200', ok.statusCode === 200, `got ${ok.statusCode}`);
    check('issues JWT', !!token);
    check('user role = farmer', okBody?.data?.user?.role === 'farmer', okBody?.data?.user?.role);

    // 3. Credential now linked to the minted user; attempts reset.
    const [linked] = await db.select({ userId: mpCredentials.userId, n: mpCredentials.bindAttempts })
      .from(mpCredentials).where(and(eq(mpCredentials.tenantId, TENANT_ID), eq(mpCredentials.phone, PHONE))).limit(1);
    check('credential linked to user', !!linked?.userId);
    check('bind_attempts reset to 0', linked?.n === 0, `n=${linked?.n}`);

    // 4. /auth/me with the token → effective module access is milk_procurement.
    const me = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { authorization: `Bearer ${token}` } });
    const meBody = me.json() as any;
    const modules: string[] = meBody?.data?.modules ?? [];
    check('me → role farmer', meBody?.data?.user?.role === 'farmer', meBody?.data?.user?.role);
    check('me → modules = [milk_procurement]',
      modules.length === 1 && modules[0] === 'milk_procurement', JSON.stringify(modules));

    // 5. Lockout: force 5 attempts, next try → 403.
    await db.update(mpCredentials).set({ bindAttempts: 5 })
      .where(and(eq(mpCredentials.tenantId, TENANT_ID), eq(mpCredentials.phone, PHONE)));
    const locked = await login(DOB_GOOD);
    check('locked after 5 attempts → 403', locked.statusCode === 403, `got ${locked.statusCode}`);
  } finally {
    await app.close();
    await pool.end();
  }

  console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
