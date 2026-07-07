/**
 * Provision the App Store / Play reviewer sign-in for the runQ HR/finance app in
 * the existing `runq-demo` tenant (which already carries demo data + all
 * modules). Idempotent and safe to re-run before a review.
 *
 * Creates two linked things, both keyed to the reviewer phone:
 *   1. an employee with a date_of_birth — so the login resolves an employee AND
 *      the demo-OTP bypass (scoped to the runq-demo tenant) accepts its DDMMYY
 *      as the code, sending no SMS. See auth/phone-auth.routes.ts#demoOtpFor.
 *   2. an `owner` user + tenant membership — so on login the reviewer gets full
 *      module access (finance + HR + …), not a bare viewer, and the app looks
 *      complete.
 *
 * Reviewer signs in with:   phone 9000000001   code 010190   (no SMS)
 *
 * Usage: DATABASE_URL=<prod-url> tsx apps/api/scripts/provision-runq-demo-login.ts
 */

import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { createDb, tenants, employees, users, userTenants } from '@runq/db';
import { and, eq, sql } from 'drizzle-orm';

const DEMO_SLUG = 'runq-demo';
// 9000000001 is the Dhenu review OPERATOR — keep the runQ HR reviewer on its own
// number so the two demos never share a users row (phone is globally unique).
const PHONE = '9000000002';
const DOB = '1990-01-01';        // -> OTP 010190 (DDMMYY)
const OTP = '010190';
const EMP_CODE = 'DEMO-REVIEWER';
const EMAIL = `phone-${PHONE}@runq.local`; // matches resolveOrProvisionUser's synth form

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL required');
  const { db, pool } = createDb(dbUrl);

  const [tenant] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, DEMO_SLUG)).limit(1);
  if (!tenant) throw new Error(`No '${DEMO_SLUG}' tenant — create it first (with finance + hr modules).`);

  // 1. Demo employee (carries the DOB the bypass reads). Idempotent on code.
  const [existingEmp] = await db.select({ id: employees.id }).from(employees)
    .where(and(eq(employees.tenantId, tenant.id), eq(employees.employeeCode, EMP_CODE))).limit(1);
  if (existingEmp) {
    await db.update(employees).set({ phone: PHONE, dateOfBirth: DOB }).where(eq(employees.id, existingEmp.id));
  } else {
    await db.insert(employees).values({
      tenantId: tenant.id, employeeCode: EMP_CODE, firstName: 'Demo', lastName: 'Reviewer',
      joiningDate: '2024-01-01', phone: PHONE, dateOfBirth: DOB,
    });
  }

  // 2. Owner user + membership, so the reviewer sees the full app. Match the
  //    user resolveOrProvisionUser would find (by phone), promoting to owner.
  let [user] = await db.select({ id: users.id, email: users.email })
    .from(users)
    .where(sql`regexp_replace(coalesce(${users.phone},''),'\\D','','g') IN (${PHONE}, ${'91' + PHONE})`)
    .limit(1);
  // Never hijack a Dhenu demo user (they share this tenant on a different phone).
  if (user?.email?.endsWith('@dhenu.local')) {
    throw new Error(`Phone ${PHONE} maps to a Dhenu user (${user.email}) — pick a different reviewer phone.`);
  }
  if (user) {
    await db.update(users).set({ role: 'owner', isActive: true, tenantId: tenant.id }).where(eq(users.id, user.id));
  } else {
    const hash = await argon2.hash(randomBytes(32).toString('hex'));
    [user] = await db.insert(users).values({
      tenantId: tenant.id, email: EMAIL, name: 'Demo Reviewer', phone: PHONE,
      role: 'owner', passwordHash: hash,
    }).returning({ id: users.id });
  }

  const [membership] = await db.select({ id: userTenants.id }).from(userTenants)
    .where(and(eq(userTenants.userId, user.id), eq(userTenants.tenantId, tenant.id))).limit(1);
  if (membership) {
    await db.update(userTenants).set({ role: 'owner' }).where(eq(userTenants.id, membership.id));
  } else {
    await db.insert(userTenants).values({ userId: user.id, tenantId: tenant.id, role: 'owner' });
  }

  console.log(`\n✅ Reviewer demo login ready in '${DEMO_SLUG}':`);
  console.log(`   Mobile number: ${PHONE}`);
  console.log(`   Code:          ${OTP}   (no SMS is sent)\n`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
