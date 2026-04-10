/**
 * Production setup script — runs after migrations.
 *
 * 1. Seeds HSN/SAC codes (tenant-independent, ~130 codes)
 * 2. Seeds standard chart of accounts for all tenants (132 accounts each)
 *
 * Safe to run on every deploy — fully idempotent.
 *
 * Usage:
 *   npx tsx seeds/setup.ts
 */

import { sql } from 'drizzle-orm';
import { createDb } from '../src/client';
import { seedHsnSacCodes } from './hsn-sac';
import { seedCoaForTenant, STANDARD_COA } from './standard-chart-of-accounts';
import { tenants } from '../src/schema/tenant';

async function setup() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const { db, pool } = createDb(dbUrl);

  // 1. HSN/SAC codes (global)
  // 0. Critical constraints that drizzle-kit push sometimes drops.
  // Belt-and-suspenders: if the constraint already exists, this is a no-op.
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'invoice_sequences'::regclass
          AND contype = 'u'
      ) THEN
        ALTER TABLE invoice_sequences
        ADD CONSTRAINT invoice_sequences_tenant_id_financial_year_unique
        UNIQUE (tenant_id, financial_year);
      END IF;
      -- Unique invoice numbers per tenant
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'sales_invoices'::regclass
          AND contype = 'u'
          AND conname = 'sales_invoices_tenant_id_invoice_number_unique'
      ) THEN
        ALTER TABLE sales_invoices
        ADD CONSTRAINT sales_invoices_tenant_id_invoice_number_unique
        UNIQUE (tenant_id, invoice_number);
      END IF;
    END
    $$;
  `);

  await seedHsnSacCodes(db);

  // 2. Chart of Accounts (per tenant)
  const tenantRows = await db.select({ id: tenants.id, name: tenants.name }).from(tenants);
  console.log(`Seeding COA (${STANDARD_COA.length} accounts) for ${tenantRows.length} tenant(s)...`);

  for (const tenant of tenantRows) {
    const count = await seedCoaForTenant(db, tenant.id);
    if (count > 0) {
      console.log(`  ${tenant.name}: ${count} new accounts`);
    }
  }

  console.log('Setup complete.');
  await pool.end();
}

setup().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});
