/**
 * One-shot: create vendors and learn narration rules for Vrindavan Dairy.
 *
 *   cd apps/api
 *   node --env-file=../../.env --import tsx src/scripts/seed-vendors-and-rules.ts
 */

import { createDb, vendors, bankNarrationRules, accounts } from '@runq/db';
import { eq, and } from 'drizzle-orm';

const TENANT_ID = 'a0365382-afa0-48b6-92cd-4db615a7d98b';

const VENDOR_LIST = [
  // Farmers
  { name: 'Muthu Benchkaldoddi', alias: 'INDUSPPBENCHKAL', expenseCode: '5001', category: 'farmer' },
  { name: 'Boganna Kumbaradoddi', alias: 'INDUSPPKUMBARAD', expenseCode: '5001', category: 'farmer' },
  { name: 'Raju Thoksandra', alias: 'INDUSPPTHOKSAND', expenseCode: '5001', category: 'farmer' },
  { name: 'Ashok Linganapura', alias: 'INDUSPPLINGANAP', expenseCode: '5001', category: 'farmer' },
  { name: 'Puttaraju Maralvadi', alias: 'INDUSPPPUTTARAJ', expenseCode: '5001', category: 'farmer' },
  { name: 'Raju Maniyambadi', alias: 'INDUSPPMANIYAMB', expenseCode: '5001', category: 'farmer' },
  { name: 'Komala Chikkasadanahalli', alias: 'INDUSPPCHKOMALA', expenseCode: '5001', category: 'farmer' },
  // Oil supplier
  { name: 'Prabhakaran SOS Oils', alias: 'VENDOROILSOS', expenseCode: '5001', category: 'supplier' },
  // Transport
  { name: 'Dairy Chetan', alias: 'DairyChetanDriv', expenseCode: '5700', category: 'transport' },
  { name: 'Anand Transport', alias: 'TRANSPORTANANDM', expenseCode: '5700', category: 'transport' },
  // Rent
  { name: 'Hub Rent HSR', alias: 'HUBRENTHSR', expenseCode: '5301', category: 'rent' },
  { name: 'Hub Rent IMD Manju', alias: 'HUBRENTIMDMANJU', expenseCode: '5301', category: 'rent' },
  // Utility
  { name: 'BESCOM', alias: 'BIL/ONL', expenseCode: '5302', category: 'utility' },
];

// Dairy Chetan has a second alias
const EXTRA_ALIASES = [
  { vendorName: 'Dairy Chetan', alias: 'DairyCheta' },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const { db, pool } = createDb(url);

  // Resolve expense codes to GL account IDs
  const glAccounts = await db.select({ id: accounts.id, code: accounts.code })
    .from(accounts)
    .where(eq(accounts.tenantId, TENANT_ID));
  const codeToId = new Map(glAccounts.map((a) => [a.code, a.id]));

  let created = 0;
  let rulesCreated = 0;

  for (const v of VENDOR_LIST) {
    const glAccountId = codeToId.get(v.expenseCode);
    if (!glAccountId) {
      console.log(`  SKIP ${v.name} — GL code ${v.expenseCode} not found`);
      continue;
    }

    // Check if vendor already exists
    const [existing] = await db.select({ id: vendors.id }).from(vendors)
      .where(and(eq(vendors.tenantId, TENANT_ID), eq(vendors.name, v.name)))
      .limit(1);

    let vendorId: string;
    if (existing) {
      vendorId = existing.id;
      console.log(`  EXISTS ${v.name} (${vendorId})`);
    } else {
      const [row] = await db.insert(vendors).values({
        tenantId: TENANT_ID,
        name: v.name,
        expenseAccountCode: v.expenseCode,
        category: v.category,
      }).returning();
      vendorId = row!.id;
      created++;
      console.log(`  CREATED ${v.name} (${vendorId})`);
    }

    // Learn narration rule
    await upsertRule(db, v.alias, glAccountId, vendorId, v.name);
    rulesCreated++;
  }

  // Extra aliases
  for (const extra of EXTRA_ALIASES) {
    const [vendor] = await db.select({ id: vendors.id, expenseAccountCode: vendors.expenseAccountCode })
      .from(vendors)
      .where(and(eq(vendors.tenantId, TENANT_ID), eq(vendors.name, extra.vendorName)))
      .limit(1);
    if (!vendor || !vendor.expenseAccountCode) continue;
    const glAccountId = codeToId.get(vendor.expenseAccountCode);
    if (!glAccountId) continue;

    await upsertRule(db, extra.alias, glAccountId, vendor.id, extra.vendorName);
    rulesCreated++;
  }

  console.log(`\nDone: ${created} vendors created, ${rulesCreated} narration rules`);
  await pool.end();
}

async function upsertRule(db: ReturnType<typeof createDb>['db'], pattern: string, glAccountId: string, vendorId: string, vendorName: string) {
  const [existing] = await db.select({ id: bankNarrationRules.id }).from(bankNarrationRules)
    .where(and(eq(bankNarrationRules.tenantId, TENANT_ID), eq(bankNarrationRules.pattern, pattern)))
    .limit(1);

  if (existing) {
    // Update existing rule to include vendorId
    await db.update(bankNarrationRules)
      .set({ vendorId, updatedAt: new Date() })
      .where(eq(bankNarrationRules.id, existing.id));
    console.log(`    RULE updated: "${pattern}" → ${vendorName}`);
  } else {
    await db.insert(bankNarrationRules).values({
      tenantId: TENANT_ID,
      pattern,
      glAccountId,
      vendorId,
      autoReconcile: true,
      txnType: 'debit',
    });
    console.log(`    RULE created: "${pattern}" → ${vendorName}`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
