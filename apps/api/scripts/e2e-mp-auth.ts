/**
 * Dhenu independent auth — end-to-end against runq_dev.
 *
 * Exercises the phone + OTP path of the mp-auth module (the social paths need a
 * real Firebase token → device-verified). Asserts the minted user is a `farmer`
 * whose effective module access is exactly `milk_procurement`, plus the OTP
 * verification. Resolves identity via `mp_credentials` only — never `employees`.
 *
 * Usage: tsx --env-file=../../.env apps/api/scripts/e2e-mp-auth.ts
 */

import { createDb, mpCredentials, users, userTenants } from '@runq/db';
import { and, eq } from 'drizzle-orm';
import { buildApp } from '../src/app';
import { mpOtpLogin } from './lib/mp-otp-login';

// runq Demo Co + farmer Ramesh Patel (seeded in runq_dev).
const TENANT_ID = '4ae78c54-aef4-46cb-9283-3db65edd076b';
const FARMER_ID = '57c3ae29-c4b9-4ac5-8bb3-30166a1a4779';
const PHONE = '9876500000';
const SYNTH_EMAIL = `mp-${PHONE}@dhenu.local`;
const DOB_ISO = '1990-05-15'; // credential still carries a DOB (profile data); not used for auth
const OTP_BAD = '000000';

let pass = 0, fail = 0;
function check(label: string, ok: boolean, detail?: string): void {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
}

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL required');
  const { db, pool } = createDb(dbUrl);

  console.log('\n=== Dhenu mp-auth e2e (phone + OTP) ===\n');

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

  // Clear any OTP state from a prior run so the send rate-limit / attempt caps
  // start fresh (Redis keys otherwise linger for up to an hour).
  await app.redis.del(`mp:otp:rate:${PHONE}`, `mp:otp:code:${PHONE}`, `mp:otp:attempts:${PHONE}`);

  const phoneLogin = (otp: string) => app.inject({
    method: 'POST', url: '/api/v1/auth/mp/phone/login', payload: { phone: PHONE, otp },
  });

  try {
    // 1. Wrong OTP (none issued) → 401.
    const bad = await phoneLogin(OTP_BAD);
    check('wrong OTP rejected 401', bad.statusCode === 401, `got ${bad.statusCode}`);

    // 2. Request + verify a real OTP → 200, mints a farmer user + JWT.
    const ok = await mpOtpLogin(app, PHONE);
    const okBody = ok.json() as any;
    const token = okBody?.data?.token as string | undefined;
    check('correct OTP → 200', ok.statusCode === 200, `got ${ok.statusCode}`);
    check('issues JWT', !!token);
    check('user role = farmer', okBody?.data?.user?.role === 'farmer', okBody?.data?.user?.role);

    // 3. Credential now linked to the minted user.
    const [linked] = await db.select({ userId: mpCredentials.userId })
      .from(mpCredentials).where(and(eq(mpCredentials.tenantId, TENANT_ID), eq(mpCredentials.phone, PHONE))).limit(1);
    check('credential linked to user', !!linked?.userId);

    // 4. /auth/me with the token → effective module access is milk_procurement.
    const me = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { authorization: `Bearer ${token}` } });
    const meBody = me.json() as any;
    const modules: string[] = meBody?.data?.modules ?? [];
    check('me → role farmer', meBody?.data?.user?.role === 'farmer', meBody?.data?.user?.role);
    check('me → modules = [milk_procurement]',
      modules.length === 1 && modules[0] === 'milk_procurement', JSON.stringify(modules));

    // 5. Verify-attempt cap: issue a fresh code, then hammer wrong guesses.
    await app.inject({ method: 'POST', url: '/api/v1/auth/mp/otp/request', payload: { phone: PHONE } });
    let last = await phoneLogin(OTP_BAD);
    for (let i = 0; i < 5; i++) last = await phoneLogin(OTP_BAD);
    check('locked after too many bad OTPs → 401', last.statusCode === 401, `got ${last.statusCode}`);
    check('lockout message surfaced', /too many/i.test(last.body), last.body);
  } finally {
    await app.close();
    await pool.end();
  }

  console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
