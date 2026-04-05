import { eq } from 'drizzle-orm';
import { createDb } from '../src/client';
import { tenants } from '../src/schema/tenant';
import { users } from '../src/schema/user';
import { seedChartOfAccounts } from './chart-of-accounts';
import { seedHsnSacCodes } from './hsn-sac';
import { seedVrindavanData } from './vrindavan-test-data';
import { seedPhase4Data } from './phase4-test-data';

async function seed() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const { db, pool } = createDb(dbUrl);

  // Find existing tenant or create new one
  let [tenant] = await db.select().from(tenants).where(eq(tenants.slug, 'demo-company')).limit(1);

  if (!tenant) {
    console.log('Seeding demo tenant...');
    [tenant] = await db.insert(tenants).values({
      name: 'Demo Company Pvt Ltd',
      slug: 'demo-company',
      settings: {
        invoicePrefix: 'INV',
        invoiceFormat: '{prefix}-{fy}-{seq}',
        financialYearStartMonth: 4,
        defaultPaymentTermsDays: 30,
        currency: 'INR',
      },
    }).returning();

    await db.insert(users).values({
      tenantId: tenant.id,
      email: 'admin@demo.com',
      name: 'Admin User',
      role: 'owner',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$placeholder',
    });
    console.log(`Demo tenant created: ${tenant.id}`);
  } else {
    console.log(`Using existing tenant: ${tenant.id}`);
  }

  await seedChartOfAccounts(db, tenant.id);
  await seedHsnSacCodes(db);

  if (process.argv.includes('--vrindavan')) {
    await seedVrindavanData(db, tenant.id);
  }

  if (process.argv.includes('--phase4')) {
    await seedPhase4Data(db, tenant.id);
  }

  console.log('Seed complete.');

  await pool.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
