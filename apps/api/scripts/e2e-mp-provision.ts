/**
 * Dhenu provisioning → login, end-to-end against runq_dev.
 *
 * Proves the web-admin path: creating a farmer with phone + DOB (via the real
 * FarmerService) provisions an `mp_credentials` row, and that farmer can then
 * sign in through the phone+OTP path — no manual seeding, no employees.
 *
 * Usage: tsx --env-file=../../.env apps/api/scripts/e2e-mp-provision.ts
 */

import { createDb, mpCredentials, mpFarmers, mpFarmerMemberships, users, userTenants, vendors } from '@runq/db';
import { and, eq } from 'drizzle-orm';
import { buildApp } from '../src/app';
import { FarmerService } from '../src/modules/milk-procurement/farmer.service';
import { mpOtpLogin } from './lib/mp-otp-login';

const TENANT_ID = '4ae78c54-aef4-46cb-9283-3db65edd076b'; // runq Demo Co
const CODE = 'E2E-PROV-1';
const PHONE = '9876512345';
const SYNTH_EMAIL = `mp-${PHONE}@dhenu.local`;
const DOB_ISO = '1988-03-22';

let pass = 0, fail = 0;
function check(label: string, ok: boolean, detail?: string): void {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
}

async function cleanup(db: any): Promise<void> {
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, SYNTH_EMAIL)).limit(1);
  if (u) {
    await db.delete(userTenants).where(eq(userTenants.userId, u.id));
    await db.update(mpCredentials).set({ userId: null }).where(eq(mpCredentials.userId, u.id));
  }
  await db.delete(mpCredentials).where(and(eq(mpCredentials.tenantId, TENANT_ID), eq(mpCredentials.phone, PHONE)));
  if (u) await db.delete(users).where(eq(users.id, u.id));
  const [farmer] = await db.select({ id: mpFarmers.id, vendorId: mpFarmers.vendorId }).from(mpFarmers)
    .where(and(eq(mpFarmers.tenantId, TENANT_ID), eq(mpFarmers.code, CODE))).limit(1);
  if (farmer) {
    await db.delete(mpFarmerMemberships).where(eq(mpFarmerMemberships.farmerId, farmer.id));
    await db.delete(mpFarmers).where(eq(mpFarmers.id, farmer.id));
    await db.delete(vendors).where(eq(vendors.id, farmer.vendorId));
  }
}

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL required');
  const { db, pool } = createDb(dbUrl);

  console.log('\n=== Dhenu provisioning → login e2e ===\n');
  await cleanup(db);

  const app = await buildApp();
  await app.ready();
  try {
    // 1. Owner creates a farmer with phone + DOB → provisions a credential.
    const service = new FarmerService(db, TENANT_ID);
    const farmer = await service.create({
      code: CODE, name: 'E2E Provision Farmer', phone: PHONE, dateOfBirth: DOB_ISO,
      isSociety: false, defaultMilkType: 'cow',
    } as any);
    check('farmer created', !!farmer?.id);

    const [cred] = await db.select().from(mpCredentials)
      .where(and(eq(mpCredentials.tenantId, TENANT_ID), eq(mpCredentials.phone, PHONE))).limit(1);
    check('credential provisioned', !!cred, cred ? `role=${cred.role}` : 'none');
    check('credential role = farmer', cred?.role === 'farmer');
    check('credential linked to farmer', cred?.farmerId === farmer.id);

    // 2. That farmer can now log in via the independent Dhenu auth (phone+OTP).
    const res = await mpOtpLogin(app, PHONE);
    const body = res.json() as any;
    check('login → 200', res.statusCode === 200, `got ${res.statusCode}`);
    check('login user role = farmer', body?.data?.user?.role === 'farmer', body?.data?.user?.role);

    // 3. Module access resolves to milk_procurement.
    const me = await app.inject({
      method: 'GET', url: '/api/v1/auth/me', headers: { authorization: `Bearer ${body?.data?.token}` },
    });
    const modules: string[] = (me.json() as any)?.data?.modules ?? [];
    check('me → modules = [milk_procurement]',
      modules.length === 1 && modules[0] === 'milk_procurement', JSON.stringify(modules));
  } finally {
    await cleanup(db);
    await app.close();
    await pool.end();
  }

  console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
