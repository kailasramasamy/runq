/**
 * Milk suppliers (A1/A2 VMCCs, Farm Taste) were set up as AP vendors with
 * 5001 Raw Material Purchases as their expense account, so milk bought before
 * the MP module — and any NEFT still auto-expensed — reads as raw material.
 *
 * Moves them to 5050 Milk Purchases: the vendor default (future postings) and
 * the 5001 debit lines already posted for them via bank_debit and
 * purchase_invoice JEs. A reclassification inside expenses — totals unchanged.
 *
 * Milk vendor = an MP node's payee, or named "A1 Milk…", "A2 Milk…", "Farm Taste…".
 *
 * Run dry:   tsx --env-file=../../.env src/scripts/fix-milk-vendor-classification.ts
 * Run apply: tsx --env-file=../../.env src/scripts/fix-milk-vendor-classification.ts --apply
 */

import { sql } from 'drizzle-orm';
import { createDb } from '@runq/db';

const TENANT_ID = 'a0365382-afa0-48b6-92cd-4db615a7d98b';

const MILK_VENDORS = sql`
  SELECT v.id FROM vendors v
  WHERE v.tenant_id = ${TENANT_ID} AND (
    v.id IN (SELECT payee_vendor_id FROM mp_nodes WHERE tenant_id = ${TENANT_ID} AND payee_vendor_id IS NOT NULL)
    OR v.name ILIKE 'A1 Milk%' OR v.name ILIKE 'A2 Milk%' OR v.name ILIKE 'Farm Taste%' OR v.name ILIKE 'FarmTaste%')`;

/** 5001 debit lines on JEs whose source document belongs to a milk vendor. */
const MILK_LINES = sql`
  SELECT jl.id FROM journal_lines jl
  JOIN journal_entries j ON j.id = jl.journal_entry_id
  JOIN accounts a ON a.id = jl.account_id AND a.code = '5001'
  WHERE j.tenant_id = ${TENANT_ID} AND jl.debit > 0 AND (
    (j.source_type = 'bank_debit' AND j.source_id IN (
      SELECT id FROM bank_transactions WHERE tenant_id = ${TENANT_ID} AND vendor_id IN (${MILK_VENDORS})))
    OR (j.source_type = 'purchase_invoice' AND j.source_id IN (
      SELECT id FROM purchase_invoices WHERE tenant_id = ${TENANT_ID} AND vendor_id IN (${MILK_VENDORS}))))`;

async function main() {
  const apply = process.argv.includes('--apply');
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const { db, pool } = createDb(url);
  console.log(apply ? '🔧 APPLY MODE' : '🔍 DRY RUN');

  const vendors = rows(await db.execute(sql`
    SELECT name, expense_account_code AS code FROM vendors WHERE id IN (${MILK_VENDORS}) ORDER BY name`));
  for (const v of vendors) console.log(`  ${v.name} (${v.code ?? '—'})`);
  const byMonth = rows(await db.execute(sql`
    SELECT to_char(j.date, 'YYYY-MM') AS month, COUNT(*)::int AS n, ROUND(SUM(jl.debit)) AS amount
    FROM journal_lines jl JOIN journal_entries j ON j.id = jl.journal_entry_id
    WHERE jl.id IN (${MILK_LINES}) GROUP BY 1 ORDER BY 1`));
  console.log(`\n${vendors.length} milk vendors. 5001 → 5050 by month:`);
  for (const r of byMonth) console.log(`  ${r.month}  ${r.n} lines  ₹${r.amount}`);

  if (apply) {
    await db.transaction(async (tx) => {
      await tx.execute(sql`
        UPDATE journal_lines SET account_id = (SELECT id FROM accounts WHERE tenant_id = ${TENANT_ID} AND code = '5050')
        WHERE id IN (${MILK_LINES})`);
      await tx.execute(sql`UPDATE vendors SET expense_account_code = '5050', updated_at = now() WHERE id IN (${MILK_VENDORS})`);
    });
    console.log('✅ applied');
  }
  await pool.end();
}

function rows(res: unknown): Record<string, string>[] {
  return (res as { rows?: Record<string, string>[] }).rows ?? [];
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
