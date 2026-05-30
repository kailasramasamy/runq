/**
 * Dump every receipt allocation against 4am invoices (both customer IDs),
 * cross-referenced with the actual amount 4am paid per invoice (from the
 * payment history file). Surfaces where runq's per-invoice allocation
 * diverges from reality so we can re-point and close 260142 + 260401.
 *
 * Reads /Users/vaidehi/Downloads/4am-payment-history.xlsx via the xlsx
 * package; if not available, falls back to a hardcoded subset for the 5
 * receipts of interest (commented at the bottom of this file).
 *
 * Usage: pnpm --filter @runq/api exec tsx src/scripts/dump-4am-receipt-allocations.ts
 */
import { createDb } from '@runq/db';
import { sql } from 'drizzle-orm';
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const TENANT_ID = 'a0365382-afa0-48b6-92cd-4db615a7d98b';
const CUSTOMER_IDS = ['22a2b7da-2adf-484d-8496-962897132d30', '7910c82f-e7b1-4610-9bc1-485da1b5b18d'];

// 5 receipts in scope: 4 bulk receipts from earlier reconciliation + the
// 26-May one where 260401 was skipped.
const RECEIPT_IDS = [
  '5d7a6b3f-0a84-4c9e-809e-52c9b98bf9d2',
  'c4ef51fa-ab9e-4ff6-b7f6-91e4ea7b2645',
  '76e9a191-442a-42e1-a540-34fd5805e59f',
  '3ef738a0-2675-4c8c-a72d-846db2639a10',
  'b0d8bd78-8fce-4a79-aad5-e081c0ce2cb8',
];

interface FreshPayment { invoiceNumber: string; amount: number; }

function loadFreshPayments(): Map<string, number> {
  // Pull via Python helper (openpyxl already used earlier in this session).
  const tmp = '/tmp/4am-fresh-payments.json';
  const py = `
import json, openpyxl
wb = openpyxl.load_workbook('/Users/vaidehi/Downloads/4am-payment-history.xlsx', data_only=True)
ws = wb['Sheet2']
out = {}
for i, row in enumerate(ws.iter_rows(values_only=True)):
    if i == 0 or row[0] is None: continue
    inv = str(row[0]).strip()
    try: amt = float(row[2])
    except: continue
    out[inv] = amt
json.dump(out, open('${tmp}','w'))
`;
  execSync(`python3 -c "${py.replace(/"/g, '\\"')}"`);
  const raw = JSON.parse(readFileSync(tmp, 'utf-8')) as Record<string, number>;
  return new Map(Object.entries(raw));
}

async function main(): Promise<void> {
  const { db } = createDb(process.env.DATABASE_URL!);
  await db.execute(sql.raw(`SET app.current_tenant_id = '${TENANT_ID}'`));

  const fresh = loadFreshPayments();
  console.log(`Loaded ${fresh.size} payment entries from 4am file.`);

  // Fetch receipt headers
  const receiptsRes = await db.execute<{
    id: string; receipt_date: string; amount: string; notes: string | null;
  }>(sql`
    SELECT id, receipt_date::text, amount, notes
    FROM payment_receipts
    WHERE tenant_id = ${TENANT_ID}
      AND id IN (${sql.raw(RECEIPT_IDS.map(id => `'${id}'`).join(','))})
    ORDER BY receipt_date
  `);
  const receipts = ((receiptsRes as unknown) as { rows: any[] }).rows;

  for (const r of receipts) {
    console.log('\n' + '═'.repeat(90));
    console.log(`Receipt ${r.id.slice(0, 8)}…  date=${r.receipt_date}  total=₹${Number(r.amount).toFixed(2)}`);
    if (r.notes) console.log(`  notes: ${r.notes}`);
    console.log('═'.repeat(90));

    // Allocations on this receipt → invoice number, allocated amount
    const allocRes = await db.execute<{
      invoice_number: string; alloc_amount: string; invoice_total: string; invoice_received: string; invoice_status: string;
    }>(sql`
      SELECT si.invoice_number, ra.amount AS alloc_amount,
             si.total_amount AS invoice_total, si.amount_received AS invoice_received, si.status::text AS invoice_status
      FROM receipt_allocations ra
      JOIN sales_invoices si ON si.id = ra.invoice_id
      WHERE ra.receipt_id = ${r.id}
      ORDER BY si.invoice_number
    `);
    const allocs = ((allocRes as unknown) as { rows: any[] }).rows;

    let allocTotal = 0, freshTotal = 0, mismatchCount = 0;
    console.log(`  ${'inv#'.padEnd(8)} ${'runq alloc'.padStart(12)}  ${'4am paid'.padStart(12)}  ${'diff'.padStart(10)}  status`);
    for (const a of allocs) {
      const runqAlloc = Number(a.alloc_amount);
      const freshAmt = fresh.get(a.invoice_number);
      const freshStr = freshAmt !== undefined ? `₹${freshAmt.toFixed(2)}` : 'NOT IN 4AM FILE';
      const diff = freshAmt !== undefined ? freshAmt - runqAlloc : 0;
      const flag = freshAmt === undefined ? ' ⚠ over-allocated (4am did NOT pay this)' : Math.abs(diff) > 0.5 ? ` ⚠ diff ₹${diff.toFixed(2)}` : '';
      allocTotal += runqAlloc;
      if (freshAmt !== undefined) freshTotal += freshAmt;
      if (flag) mismatchCount++;
      console.log(`  ${a.invoice_number.padEnd(8)} ${('₹' + runqAlloc.toFixed(2)).padStart(12)}  ${freshStr.padStart(12)}  ${('₹' + diff.toFixed(2)).padStart(10)}  ${a.invoice_status}${flag}`);
    }
    console.log(`  ${'─'.repeat(70)}`);
    console.log(`  totals    ${('₹' + allocTotal.toFixed(2)).padStart(12)}  ${('₹' + freshTotal.toFixed(2)).padStart(12)}  ${('₹' + (freshTotal - allocTotal).toFixed(2)).padStart(10)}  ${mismatchCount} mismatches`);
  }

  // Quick scan: which invoices are MISSING allocations entirely (should be paid per 4am file but runq has 0 received)
  console.log('\n' + '═'.repeat(90));
  console.log('Invoices 4am paid but runq has no receipt allocation:');
  console.log('═'.repeat(90));
  const orphanRes = await db.execute<{ invoice_number: string; invoice_date: string; total_amount: string; amount_received: string }>(sql`
    SELECT invoice_number, invoice_date::text, total_amount, amount_received
    FROM sales_invoices
    WHERE tenant_id = ${TENANT_ID}
      AND customer_id IN (${sql.raw(CUSTOMER_IDS.map(id => `'${id}'`).join(','))})
      AND amount_received < total_amount
      AND status != 'cancelled'
    ORDER BY invoice_date
  `);
  const orphans = ((orphanRes as unknown) as { rows: any[] }).rows;
  for (const o of orphans) {
    const freshAmt = fresh.get(o.invoice_number);
    const tag = freshAmt !== undefined ? `→ 4am paid ₹${freshAmt.toFixed(2)}` : '→ NOT in 4am file (unpaid OR mis-numbered)';
    console.log(`  ${o.invoice_number}  date=${o.invoice_date}  total=₹${Number(o.total_amount).toFixed(2)}  recvd=₹${Number(o.amount_received).toFixed(2)}  ${tag}`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
