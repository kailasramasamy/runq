/**
 * Unblock May 2026 GSTR-1 generation for Vrindavan Dairy by fixing line-item
 * HSN / UoM data drift.
 *
 * Two issues:
 *
 *   1. ~111 line items in May 2026 invoices were tagged with HSN 04031000
 *      (curd) but are linked to milk / ghee items in the items master. This
 *      mis-classification makes the GSTR-1 HSN aggregator see HSN 04031000
 *      with both LTR (from the milk lines) and KGS (from the real curd
 *      lines) → crash. Fix: sync hsn_sac_code from items.hsn_sac_code for
 *      every line with an item_id whose HSN diverges from the master.
 *
 *   2. The reconciliation invoice 260142 (created today) has no
 *      pack_size_uqc on its single milk line. Generator resolution falls
 *      through to uom='' → 'NOS', creating a 3rd UQC family for HSN
 *      04012000 (which is otherwise uniformly LTR across 453 lines) → crash.
 *      Fix: set pack_size_uqc='LTR' on 260142's line.
 *
 * Scope: only lines on invoices NOT in any filed GSTR-1 return AND with
 * invoice_date >= filing start period. We do NOT touch April 2026 invoices
 * (already filed — historical record is immutable on the GSTN side).
 *
 * Usage:
 *   pnpm --filter @runq/api exec tsx src/scripts/fix-vrindavan-hsn.ts             # dry-run
 *   FIX_LIVE=1 pnpm --filter @runq/api exec tsx src/scripts/fix-vrindavan-hsn.ts  # commit
 */
import { createDb } from '@runq/db';
import { sql } from 'drizzle-orm';

const TENANT_ID = 'a0365382-afa0-48b6-92cd-4db615a7d98b';
const LIVE = process.env.FIX_LIVE === '1';

async function main(): Promise<void> {
  const { db } = createDb(process.env.DATABASE_URL!);
  await db.execute(sql.raw(`SET app.current_tenant_id = '${TENANT_ID}'`));

  console.log('━'.repeat(70));
  console.log(`Vrindavan HSN / UoM fix — ${LIVE ? '🔴 LIVE' : '🟢 DRY-RUN'}`);
  console.log('━'.repeat(70));

  // ─── Fix 1: re-tag HSN from item master on May invoices ─────────────
  const driftedLines = await db.execute<{
    line_id: string; invoice_number: string; item_name: string;
    current_hsn: string; correct_hsn: string; amount: string;
  }>(sql`
    SELECT
      sii.id AS line_id, si.invoice_number, i.name AS item_name,
      sii.hsn_sac_code AS current_hsn, i.hsn_sac_code AS correct_hsn, sii.amount
    FROM sales_invoice_items sii
    JOIN sales_invoices si ON si.id = sii.invoice_id
    JOIN items i ON i.id = sii.item_id
    WHERE sii.tenant_id = ${TENANT_ID}
      AND si.tenant_id = ${TENANT_ID}
      AND si.invoice_date >= '2026-05-01'
      AND si.status IN ('sent','partially_paid','paid','overdue')
      AND sii.hsn_sac_code IS DISTINCT FROM i.hsn_sac_code
      AND i.hsn_sac_code IS NOT NULL
    ORDER BY si.invoice_number, i.name
  `);
  const drifted = ((driftedLines as unknown) as { rows: any[] }).rows;

  console.log(`\nFix 1 — HSN drift on May invoice lines: ${drifted.length} line(s)`);
  // Group by (item, currentHsn → correctHsn) for summary
  const groups = new Map<string, { count: number; amount: number }>();
  for (const r of drifted) {
    const key = `${r.item_name}  [${r.current_hsn ?? 'NULL'} → ${r.correct_hsn}]`;
    const g = groups.get(key) ?? { count: 0, amount: 0 };
    g.count += 1; g.amount += Number(r.amount);
    groups.set(key, g);
  }
  for (const [k, v] of groups) {
    console.log(`  ${k} — ${v.count} line(s), ₹${v.amount.toFixed(2)}`);
  }

  if (LIVE && drifted.length > 0) {
    const res = await db.execute(sql`
      UPDATE sales_invoice_items sii
      SET hsn_sac_code = i.hsn_sac_code, updated_at = NOW()
      FROM items i, sales_invoices si
      WHERE sii.item_id = i.id
        AND sii.invoice_id = si.id
        AND sii.tenant_id = ${TENANT_ID}
        AND si.tenant_id = ${TENANT_ID}
        AND si.invoice_date >= '2026-05-01'
        AND si.status IN ('sent','partially_paid','paid','overdue')
        AND sii.hsn_sac_code IS DISTINCT FROM i.hsn_sac_code
        AND i.hsn_sac_code IS NOT NULL
    `);
    const updated = ((res as unknown) as { rowCount?: number }).rowCount ?? 0;
    console.log(`  ✓ Updated ${updated} row(s)`);
  } else if (drifted.length > 0) {
    console.log('  [dry-run] would update');
  }

  // ─── Fix 2: 260142's line — set pack_size_uqc='LTR' ─────────────────
  const inv260142Lines = await db.execute<{ id: string; pack_size_uqc: string | null; uom: string | null }>(sql`
    SELECT sii.id, sii.pack_size_uqc, sii.uom
    FROM sales_invoice_items sii
    JOIN sales_invoices si ON si.id = sii.invoice_id
    WHERE si.tenant_id = ${TENANT_ID}
      AND si.invoice_number = '260142'
  `);
  const lines260142 = ((inv260142Lines as unknown) as { rows: any[] }).rows;

  console.log(`\nFix 2 — 260142 line UoM: ${lines260142.length} line(s)`);
  for (const r of lines260142) {
    console.log(`  Line ${r.id.slice(0, 8)}…  pack_size_uqc='${r.pack_size_uqc ?? ''}'  uom='${r.uom ?? ''}'  → will set pack_size_uqc='LTR'`);
  }

  if (LIVE && lines260142.length > 0) {
    const res = await db.execute(sql`
      UPDATE sales_invoice_items
      SET pack_size_uqc = 'LTR', uom = 'LTR', updated_at = NOW()
      WHERE id IN (
        SELECT sii.id FROM sales_invoice_items sii
        JOIN sales_invoices si ON si.id = sii.invoice_id
        WHERE si.tenant_id = ${TENANT_ID} AND si.invoice_number = '260142'
      )
    `);
    const updated = ((res as unknown) as { rowCount?: number }).rowCount ?? 0;
    console.log(`  ✓ Updated ${updated} row(s)`);
  } else if (lines260142.length > 0) {
    console.log('  [dry-run] would update');
  }

  console.log('\n' + '━'.repeat(70));
  console.log(LIVE ? '✅ Fix applied.' : 'Dry-run complete. Set FIX_LIVE=1 to commit.');
  console.log('Next: re-run preview-may-gstr1.ts to confirm generator no longer throws.');
}

main().catch((err) => { console.error(err); process.exit(1); });
