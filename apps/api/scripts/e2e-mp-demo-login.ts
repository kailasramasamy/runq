/**
 * Dhenu demo-login (App/Play review) end-to-end against runq_dev — proves the
 * DB-seeded demo sign-in works WITHOUT any MP_DEMO_* env config, and that the
 * bypass is scoped to the runq-demo tenant so real DOB-bearing credentials
 * (pre-migration leftovers) cannot use their DOB to sign in.
 *
 * Usage: tsx --env-file=../../.env apps/api/scripts/e2e-mp-demo-login.ts
 */

import { createDb, mpCredentials, tenants } from '@runq/db';
import { and, eq, isNotNull, ne } from 'drizzle-orm';
import { buildApp } from '../src/app';
import { dobToDDMMYY } from '../src/modules/auth/auth-session';

const DEMO_PHONE = '9000000001';
const DEMO_OTP = '010190'; // DDMMYY(1990-01-01)

let pass = 0, fail = 0;
function check(label: string, ok: boolean, detail?: string): void {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
}

const otpReq = (app: any, phone: string) => app.inject({
  method: 'POST', url: '/api/v1/auth/mp/otp/request', payload: { phone },
});
const login = (app: any, phone: string, otp: string) => app.inject({
  method: 'POST', url: '/api/v1/auth/mp/phone/login', payload: { phone, otp },
});

async function main(): Promise<void> {
  // Make sure no env bypass is in play — this must work purely off seeded data.
  delete process.env.MP_DEMO_OTP;
  delete process.env.MP_DEMO_PHONES;

  const { db, pool } = createDb(process.env.DATABASE_URL!);
  const app = await buildApp();
  await app.ready();
  console.log('\n=== Dhenu demo-login (no env) e2e ===\n');
  try {
    // 1. Demo account: no SMS, seeded DOB code signs in.
    console.log('Demo account (runq-demo tenant):');
    const req = await otpReq(app, DEMO_PHONE);
    check('otp/request → 200', req.statusCode === 200, `got ${req.statusCode}`);
    check('otp/request returns seeded DOB devCode', (req.json() as any)?.data?.devCode === DEMO_OTP,
      (req.json() as any)?.data?.devCode);
    const ok = await login(app, DEMO_PHONE, DEMO_OTP);
    check('login with 010190 → 200', ok.statusCode === 200, `got ${ok.statusCode}`);
    check('login role = field_operator', (ok.json() as any)?.data?.user?.role === 'field_operator');
    const bad = await login(app, DEMO_PHONE, '999999');
    check('login with wrong code → 401', bad.statusCode === 401, `got ${bad.statusCode}`);

    // 2. Security gate: a real DOB-bearing credential outside runq-demo must NOT
    //    be able to sign in with its DOB (no env bypass, wrong-tenant).
    console.log('\nSecurity gate (real DOB account, other tenant):');
    const [real] = await db.select({ phone: mpCredentials.phone, dob: mpCredentials.dateOfBirth })
      .from(mpCredentials)
      .innerJoin(tenants, eq(tenants.id, mpCredentials.tenantId))
      .where(and(
        isNotNull(mpCredentials.dateOfBirth),
        eq(mpCredentials.isActive, true),
        ne(tenants.slug, 'runq-demo'),
      )).limit(1);
    if (!real) {
      console.log('  … no non-demo DOB credential present — gate check skipped');
    } else {
      await otpReq(app, real.phone); // sends a real (random) code, not the DOB
      const attempt = await login(app, real.phone, dobToDDMMYY(real.dob)!);
      check('real account cannot log in with its DOB', attempt.statusCode !== 200, `got ${attempt.statusCode}`);
    }
  } finally {
    await app.close();
    await pool.end();
  }
  console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
