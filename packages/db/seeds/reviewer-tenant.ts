/**
 * Creates a self-contained demo tenant + reviewer user for App Store review.
 *
 * Usage:
 *   DATABASE_URL=... tsx seeds/reviewer-tenant.ts
 *
 * Idempotent: re-running upserts the tenant/user and refreshes the seeded
 * data so the demo is always pristine for review.
 */
import { eq } from 'drizzle-orm';
import argon2 from 'argon2';
import { createDb } from '../src/client';
import { tenants, users } from '../src/index';
import { seedChartOfAccounts } from './chart-of-accounts';
import { seedHsnSacCodes } from './hsn-sac';
import { seedVrindavanData } from './vrindavan-test-data';
import { seedGstData } from './gst-test-data';

const REVIEWER_EMAIL = 'appreview@runq.in';
const REVIEWER_PASSWORD = 'AppleReview2026!';
const TENANT_SLUG = 'runq-demo';
const TENANT_NAME = 'runq Demo Co';

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const { db, pool } = createDb(dbUrl);

  // 1. Tenant
  let [tenant] = await db.select().from(tenants).where(eq(tenants.slug, TENANT_SLUG)).limit(1);
  if (!tenant) {
    console.log('Creating reviewer tenant...');
    [tenant] = await db.insert(tenants).values({
      name: TENANT_NAME,
      slug: TENANT_SLUG,
      settings: {
        invoicePrefix: 'INV',
        invoiceFormat: '{prefix}-{fy}-{seq}',
        financialYearStartMonth: 4,
        defaultPaymentTermsDays: 30,
        currency: 'INR',
        legalName: 'runq Demo Company Pvt Ltd',
        gstin: '33AAGCB1286Q2ZA',
        gstUsername: 'TN_NT2.152384',
        gstFilingStartPeriod: '042026',
        state: 'Tamil Nadu',
        stateCode: '33',
        city: 'Chennai',
        pincode: '600001',
        addressLine1: 'No. 12, Anna Salai',
      },
    }).returning();
    console.log(`  ✓ Tenant: ${tenant.id}`);
  } else {
    console.log(`Using existing tenant: ${tenant.id}`);
  }

  // 2. Reviewer user
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, REVIEWER_EMAIL))
    .limit(1);

  const passwordHash = await argon2.hash(REVIEWER_PASSWORD);

  if (!existingUser) {
    await db.insert(users).values({
      tenantId: tenant.id,
      email: REVIEWER_EMAIL,
      name: 'App Review',
      role: 'owner',
      passwordHash,
    });
    console.log(`  ✓ User: ${REVIEWER_EMAIL} → owner`);
  } else {
    await db
      .update(users)
      .set({ passwordHash, tenantId: tenant.id, role: 'owner' })
      .where(eq(users.id, existingUser.id));
    console.log(`  ✓ User refreshed: ${REVIEWER_EMAIL}`);
  }

  // 3. Seed reference + transactional data (idempotent at the dataset level —
  // re-running over the same tenant will append, so only run once per tenant)
  console.log('Seeding reference data...');
  await seedChartOfAccounts(db, tenant.id);
  await seedHsnSacCodes(db);

  console.log('Seeding business data...');
  await seedVrindavanData(db, tenant.id);

  console.log('Seeding GST data...');
  await seedGstData(db, tenant.id);

  console.log('\n✅ Reviewer tenant ready.\n');
  console.log('App Review credentials:');
  console.log(`  Email:    ${REVIEWER_EMAIL}`);
  console.log(`  Password: ${REVIEWER_PASSWORD}`);
  console.log(`  Tenant:   ${TENANT_SLUG}`);

  await pool.end();
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
