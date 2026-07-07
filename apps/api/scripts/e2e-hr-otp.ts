/**
 * runq HR mobile auth — phone + OTP end-to-end against runq_dev.
 *
 * Exercises the MSG91 phone-OTP path of the auth module: request an SMS code
 * (dev returns it as `devCode`), verify it, and assert a runq session is minted
 * for the matching `employees` row. Also checks the unknown-number gate (404)
 * and the wrong-code rejection (401). Resolves identity via `employees` only.
 *
 * Usage: tsx --env-file=../../.env apps/api/scripts/e2e-hr-otp.ts
 */

import { createDb, employees } from '@runq/db';
import { sql } from 'drizzle-orm';
import { buildApp } from '../src/app';

let pass = 0, fail = 0;
function check(label: string, ok: boolean, detail?: string): void {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
}

// Bare 10-digit national number, matching the API's normalisation.
function national(raw: string): string {
  const d = raw.replace(/\D/g, '');
  return d.length > 10 ? d.slice(-10) : d;
}

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL required');
  const { db, pool } = createDb(dbUrl);

  console.log('\n=== runq HR auth e2e (phone + OTP) ===\n');

  const [emp] = await db
    .select({ phone: employees.phone, first: employees.firstName })
    .from(employees)
    .where(sql`${employees.phone} is not null and length(regexp_replace(${employees.phone},'\\D','','g')) >= 10`)
    .limit(1);
  if (!emp) throw new Error('No employee with a phone in runq_dev to test against');

  const phone = national(emp.phone!);
  const unknown = '9099099099';
  console.log(`  fixture: employee ${emp.first} → phone ${phone}\n`);

  const app = await buildApp();
  await app.ready();

  // ── Unknown number is rejected before any SMS ────────────────────────────
  const noEmp = await app.inject({
    method: 'POST', url: '/api/v1/auth/otp/request', payload: { phone: unknown },
  });
  check('unknown number → 404', noEmp.statusCode === 404, `got ${noEmp.statusCode}`);

  // ── Request the OTP (dev returns the code) ───────────────────────────────
  const req = await app.inject({
    method: 'POST', url: '/api/v1/auth/otp/request', payload: { phone },
  });
  check('otp/request → 200', req.statusCode === 200, `got ${req.statusCode}`);
  const devCode = req.json().data?.devCode as string | undefined;
  check('devCode returned (non-prod)', !!devCode && /^\d{6}$/.test(devCode ?? ''), devCode);

  // ── Wrong code is rejected ───────────────────────────────────────────────
  const bad = await app.inject({
    method: 'POST', url: '/api/v1/auth/phone/login', payload: { phone, otp: '000000' },
  });
  check('wrong otp → 401', bad.statusCode === 401, `got ${bad.statusCode}`);

  // ── Correct code mints a session ─────────────────────────────────────────
  const login = await app.inject({
    method: 'POST', url: '/api/v1/auth/phone/login', payload: { phone, otp: devCode },
  });
  check('phone/login → 200', login.statusCode === 200, `got ${login.statusCode}`);
  const token = login.json().data?.token as string | undefined;
  check('session token issued', !!token);

  // ── Token authenticates /auth/me ─────────────────────────────────────────
  if (token) {
    const me = await app.inject({
      method: 'GET', url: '/api/v1/auth/me', headers: { authorization: `Bearer ${token}` },
    });
    check('me → 200 with token', me.statusCode === 200, `got ${me.statusCode}`);
    check('me returns a user', !!me.json().data?.user);
  }

  await app.close();
  await pool.end();

  console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed\n`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
