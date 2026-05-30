/**
 * Rebuild receipt_allocations for the 7 large 4am bank receipts using 4am's
 * Sheet1 as the authoritative source.
 *
 * 4am's payment-history Sheet1 lists each bank transfer as a block with the
 * exact invoices + amounts they intended to settle. runq's auto-allocator
 * had distributed differently (split single payments across two receipts,
 * over-allocated to invoices 4am didn't actually pay). This script wipes
 * those allocations and rebuilds them per 4am's truth, then recomputes each
 * invoice's amount_received / balance_due / status.
 *
 * Invoices with already-issued CNs (status='adjusted') get the CN amount
 * folded into amount_received during recompute — preserves the net AR
 * position (CN reduces customer balance; cash + CN = invoice total).
 *
 * Invoices in 4am Sheet1 that don't exist in runq (e.g. 253501, 253502 —
 * opening-balance pre-tenant entries that runq tracks as a single
 * OB-TFTP-2526) are logged and skipped.
 *
 * Usage:
 *   pnpm --filter @runq/api exec tsx src/scripts/reallocate-4am-receipts.ts
 *   RECONCILE_LIVE=1 pnpm --filter @runq/api exec tsx src/scripts/reallocate-4am-receipts.ts
 */
import { createDb } from '@runq/db';
import { sql } from 'drizzle-orm';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const TENANT_ID = 'a0365382-afa0-48b6-92cd-4db615a7d98b';
const LIVE = process.env.RECONCILE_LIVE === '1';
const XLSX_PATH = '/Users/vaidehi/Downloads/4am-payment-history.xlsx';

// Block totals from 4am Sheet1 → runq receipt UUIDs.
// 4am uses different invoice numbers for two cases:
//   - 260044 (theirs)          ↔ 260047 (runq's clerical mismatch — stays as-is in runq)
//   - 253501 + 253502 (theirs) ↔ OB-TFTP-2526 (runq's single opening-balance record)
// Both ends keep their canonical numbers; allocation maps 4am's number → runq's id.
const INVOICE_NUMBER_REMAP: Record<string, string> = {
  '260044': '260047',
  '253501': 'OB-TFTP-2526',
  '253502': 'OB-TFTP-2526',
};

const BLOCK_TO_RECEIPT: Record<string, { receiptId: string; receiptAmount: number; blockTotal: number; receiptDate: string }> = {
  '100268.12': { receiptId: 'b0d8bd78-8fce-4a79-aad5-e081c0ce2cb8', receiptAmount: 100268,  blockTotal: 100268.12, receiptDate: '2026-05-26' },
  '103454.45': { receiptId: '3ef738a0-2675-4c8c-a72d-846db2639a10', receiptAmount: 103454,  blockTotal: 103454.45, receiptDate: '2026-05-20' },
  '39390.69':  { receiptId: '5c574b22-25d5-4f01-af4c-9296daa22732', receiptAmount: 39390,   blockTotal: 39390.69,  receiptDate: '2026-05-12' },
  '197852.71': { receiptId: '76e9a191-442a-42e1-a540-34fd5805e59f', receiptAmount: 197853,  blockTotal: 197852.71, receiptDate: '2026-05-07' },
  '71370.78':  { receiptId: '04e49bb5-5a83-4feb-9a77-7cffa4dffb23', receiptAmount: 71370,   blockTotal: 71370.78,  receiptDate: '2026-04-28' },
  '93010.54':  { receiptId: 'c4ef51fa-ab9e-4ff6-b7f6-91e4ea7b2645', receiptAmount: 93010,   blockTotal: 93010.54,  receiptDate: '2026-04-20' },
  '82893.22':  { receiptId: '5d7a6b3f-0a84-4c9e-809e-52c9b98bf9d2', receiptAmount: 82893,   blockTotal: 82893.22,  receiptDate: '2026-04-09' },
};

interface ParsedBlock { total: number; entries: Array<{ invoiceNumber: string; amount: number }> }

function parseFreshSheet1(): ParsedBlock[] {
  const tmp = '/tmp/4am-sheet1.json';
  const py = `
import json, openpyxl
wb = openpyxl.load_workbook('${XLSX_PATH}', data_only=True)
ws = wb['Sheet1']
blocks = []
cur = []
for row in ws.iter_rows(values_only=True):
    if not row: continue
    first = row[0]
    if first is None: continue
    s = str(first).strip().lower()
    if s in ('inv number', 'invnumber'):
        if cur: pass
        cur = []
        continue
    if s in ('total', 'ttoal'):
        total = float(row[3]) if row[3] is not None else 0
        blocks.append({'total': total, 'entries': cur})
        cur = []
        continue
    if row[0] is None or row[3] is None: continue
    try:
        amt = float(row[3])
    except: continue
    cur.append({'invoiceNumber': str(row[0]).strip(), 'amount': amt})
json.dump(blocks, open('${tmp}', 'w'))
`;
  execSync(`python3 -c "${py.replace(/"/g, '\\"')}"`);
  return JSON.parse(readFileSync(tmp, 'utf-8')) as ParsedBlock[];
}

async function main(): Promise<void> {
  const { db } = createDb(process.env.DATABASE_URL!);
  await db.execute(sql.raw(`SET app.current_tenant_id = '${TENANT_ID}'`));

  console.log('━'.repeat(74));
  console.log(`4am receipt re-allocation — ${LIVE ? '🔴 LIVE' : '🟢 DRY-RUN'}`);
  console.log('━'.repeat(74));

  // 1) Parse 4am Sheet1
  const blocks = parseFreshSheet1();
  console.log(`Parsed ${blocks.length} blocks from 4am Sheet1`);

  // 2) Map block totals → receipts. Apply invoice-number remap so 4am's
  // numbering aligns with runq's identifiers. Merge same-invoice entries
  // (e.g. 253501 + 253502 both → OB-TFTP-2526) by summing amounts.
  const plan: Array<{ receiptId: string; receiptDate: string; receiptAmount: number; allocs: Array<{ invoiceNumber: string; invoiceId?: string; amount: number; status?: 'ok'|'invoice-missing' }> }> = [];
  for (const b of blocks) {
    const key = b.total.toFixed(2);
    const r = BLOCK_TO_RECEIPT[key];
    if (!r) { console.error(`No receipt mapping for block total ${key}`); continue; }
    const merged = new Map<string, number>();
    for (const e of b.entries) {
      const runqNumber = INVOICE_NUMBER_REMAP[e.invoiceNumber] ?? e.invoiceNumber;
      merged.set(runqNumber, (merged.get(runqNumber) ?? 0) + e.amount);
    }
    plan.push({ receiptId: r.receiptId, receiptDate: r.receiptDate, receiptAmount: r.receiptAmount, allocs: [...merged.entries()].map(([invoiceNumber, amount]) => ({ invoiceNumber, amount })) });
  }

  // 3) Resolve invoice numbers → IDs
  const allInvNumbers = Array.from(new Set(plan.flatMap(p => p.allocs.map(a => a.invoiceNumber))));
  const invRowsRaw = await db.execute<{ id: string; invoice_number: string; total_amount: string; status: string }>(sql`
    SELECT id, invoice_number, total_amount, status::text
    FROM sales_invoices
    WHERE tenant_id = ${TENANT_ID}
      AND invoice_number IN (${sql.raw(allInvNumbers.map(n => `'${n}'`).join(','))})
  `);
  const invRows = ((invRowsRaw as unknown) as { rows: any[] }).rows;
  const invByNumber = new Map<string, { id: string; total: number; status: string }>();
  for (const r of invRows) invByNumber.set(r.invoice_number, { id: r.id, total: Number(r.total_amount), status: r.status });

  // 4) Mark missing invoices
  for (const p of plan) {
    for (const a of p.allocs) {
      const inv = invByNumber.get(a.invoiceNumber);
      if (!inv) { a.status = 'invoice-missing'; }
      else { a.invoiceId = inv.id; a.status = 'ok'; }
    }
  }

  // 5) Print per-receipt diff (old allocs vs new allocs)
  let totalUpdates = 0;
  for (const p of plan) {
    console.log('\n' + '═'.repeat(74));
    console.log(`Receipt ${p.receiptId.slice(0,8)}…  date=${p.receiptDate}  amount=₹${p.receiptAmount}`);
    console.log('═'.repeat(74));

    const oldRaw = await db.execute<{ invoice_number: string; amount: string }>(sql`
      SELECT si.invoice_number, ra.amount
      FROM receipt_allocations ra JOIN sales_invoices si ON si.id = ra.invoice_id
      WHERE ra.receipt_id = ${p.receiptId}
    `);
    const oldRows = ((oldRaw as unknown) as { rows: any[] }).rows;
    const oldByInv = new Map(oldRows.map(r => [r.invoice_number as string, Number(r.amount)]));

    const newByInv = new Map(p.allocs.filter(a => a.status === 'ok').map(a => [a.invoiceNumber, a.amount]));

    const allInvs = new Set<string>([...oldByInv.keys(), ...newByInv.keys()]);
    const sortedInvs = [...allInvs].sort();

    let oldSum = 0, newSum = 0;
    for (const inv of sortedInvs) {
      const o = oldByInv.get(inv) ?? 0;
      const n = newByInv.get(inv) ?? 0;
      if (Math.abs(o - n) < 0.005) { oldSum += o; newSum += n; continue; }
      const tag = n === 0 ? '← REMOVE' : o === 0 ? '← ADD' : '← change';
      console.log(`  ${inv.padEnd(15)}  ${('₹'+o.toFixed(2)).padStart(11)}  →  ${('₹'+n.toFixed(2)).padStart(11)}  ${tag}`);
      oldSum += o; newSum += n;
      totalUpdates++;
    }
    console.log(`  ${'─'.repeat(60)}`);
    console.log(`  ${'totals'.padEnd(15)}  ${('₹'+oldSum.toFixed(2)).padStart(11)}  →  ${('₹'+newSum.toFixed(2)).padStart(11)}  (receipt: ₹${p.receiptAmount.toFixed(2)})`);

    const missing = p.allocs.filter(a => a.status === 'invoice-missing');
    if (missing.length > 0) {
      console.log(`\n  Skipped (invoice not in runq):`);
      for (const m of missing) console.log(`    ${m.invoiceNumber} ₹${m.amount.toFixed(2)}`);
    }
  }

  if (!LIVE) {
    console.log('\n' + '━'.repeat(74));
    console.log(`Dry-run complete: ${totalUpdates} per-line allocation changes.`);
    console.log('Set RECONCILE_LIVE=1 to commit.');
    return;
  }

  // 6) LIVE: wipe + re-insert allocations, then recompute invoices
  console.log('\n' + '━'.repeat(74));
  console.log('Applying changes…');

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${TENANT_ID}'`));

    // PRE-STEP: un-void 260291. User clarified 4am genuinely missed paying
    // it (not a duplicate), so it should remain as a real outstanding
    // receivable. The earlier void flow had cancelled the invoice + issued
    // CN-0004 to reverse AR. Undo both: restore status, delete the CN and
    // its journal entry so AR comes back up for collection.
    const cn4Raw = await tx.execute<{ id: string }>(sql`
      SELECT cn.id
      FROM credit_notes cn
      JOIN sales_invoices si ON si.id = cn.invoice_id
      WHERE cn.tenant_id = ${TENANT_ID}
        AND si.invoice_number = '260291'
    `);
    const cn4 = (((cn4Raw as unknown) as { rows: any[] }).rows)[0];
    if (cn4) {
      // Reverse the GL posting. journal_lines FK → journal_entries, so
      // wipe lines first then the header.
      await tx.execute(sql`
        DELETE FROM journal_lines WHERE journal_entry_id IN (
          SELECT id FROM journal_entries
          WHERE tenant_id = ${TENANT_ID}
            AND source_type = 'credit_note'
            AND source_id   = ${cn4.id}
        )
      `);
      await tx.execute(sql`
        DELETE FROM journal_entries
        WHERE tenant_id = ${TENANT_ID}
          AND source_type = 'credit_note'
          AND source_id   = ${cn4.id}
      `);
      // Delete CN items then the CN itself
      await tx.execute(sql`DELETE FROM credit_note_items WHERE credit_note_id = ${cn4.id} AND tenant_id = ${TENANT_ID}`);
      await tx.execute(sql`DELETE FROM credit_notes WHERE id = ${cn4.id} AND tenant_id = ${TENANT_ID}`);
      console.log(`  ✓ Removed CN-0004 (id ${cn4.id.slice(0,8)}…) and its JE`);
    }
    // Restore 260291's status — actual amount_received/balance_due gets
    // recomputed below from the rebuilt receipt allocations.
    await tx.execute(sql`
      UPDATE sales_invoices
      SET status = 'sent', updated_at = NOW()
      WHERE tenant_id = ${TENANT_ID} AND invoice_number = '260291'
    `);
    console.log(`  ✓ Restored 260291 from cancelled → sent`);

    // Wipe existing allocations on the 7 receipts
    for (const p of plan) {
      await tx.execute(sql`DELETE FROM receipt_allocations WHERE receipt_id = ${p.receiptId}`);
    }

    // Insert new allocations
    for (const p of plan) {
      for (const a of p.allocs) {
        if (a.status !== 'ok' || !a.invoiceId) continue;
        await tx.execute(sql`
          INSERT INTO receipt_allocations (tenant_id, receipt_id, invoice_id, amount)
          VALUES (${TENANT_ID}, ${p.receiptId}, ${a.invoiceId}, ${a.amount.toFixed(2)})
        `);
      }
    }

    // Collect every invoice whose allocations could have changed: union of
    // old allocations (now wiped) + new allocations (just inserted) + any
    // invoice with a CN/DN that we issued.
    const affectedInvIds = new Set<string>();
    for (const p of plan) for (const a of p.allocs) if (a.invoiceId) affectedInvIds.add(a.invoiceId);

    // Also include invoices that previously had allocations on these receipts
    // (some were removed entirely — they need their amount_received recomputed).
    const oldInvRaw = await tx.execute<{ invoice_id: string }>(sql`
      SELECT DISTINCT invoice_id FROM receipt_allocations
      WHERE invoice_id IS NOT NULL AND tenant_id = ${TENANT_ID}
    `);
    const previouslyRaw = await tx.execute<{ invoice_id: string }>(sql`
      SELECT DISTINCT id AS invoice_id FROM sales_invoices
      WHERE tenant_id = ${TENANT_ID} AND amount_received > 0
    `);
    for (const r of (((previouslyRaw as unknown) as { rows: any[] }).rows)) affectedInvIds.add(r.invoice_id);
    // We don't actually want EVERY invoice with amount_received > 0;
    // re-narrow: just iterate every invoice ever linked, recompute from
    // current state of receipt_allocations + CN/DN. This is safe (idempotent).

    // Pull CN/DN map (issued or adjusted, by linked invoice)
    const cnsRaw = await tx.execute<{ invoice_id: string; amount: string }>(sql`
      SELECT invoice_id, amount FROM credit_notes
      WHERE tenant_id = ${TENANT_ID} AND status IN ('issued','adjusted') AND invoice_id IS NOT NULL
    `);
    const cnByInv = new Map<string, number>();
    for (const r of (((cnsRaw as unknown) as { rows: any[] }).rows)) {
      cnByInv.set(r.invoice_id, (cnByInv.get(r.invoice_id) ?? 0) + Number(r.amount));
    }

    // For every invoice tied to 4am customers, recompute amount_received,
    // balance_due, status. Scope only to 4am to keep blast radius small.
    const fourAmInvsRaw = await tx.execute<{ id: string; total_amount: string; status: string }>(sql`
      SELECT id, total_amount, status::text
      FROM sales_invoices
      WHERE tenant_id = ${TENANT_ID}
        AND customer_id IN ('22a2b7da-2adf-484d-8496-962897132d30', '7910c82f-e7b1-4610-9bc1-485da1b5b18d')
    `);
    const fourAmInvs = ((fourAmInvsRaw as unknown) as { rows: any[] }).rows;

    // Reload status after the 260291 un-void above so we don't accidentally
    // skip it as "cancelled" in the recompute.
    const fourAmInvsRefreshed = ((await tx.execute<{ id: string; total_amount: string; status: string }>(sql`
      SELECT id, total_amount, status::text
      FROM sales_invoices
      WHERE tenant_id = ${TENANT_ID}
        AND customer_id IN ('22a2b7da-2adf-484d-8496-962897132d30', '7910c82f-e7b1-4610-9bc1-485da1b5b18d')
    `) as unknown) as { rows: any[] }).rows;

    for (const inv of fourAmInvsRefreshed) {
      if (inv.status === 'cancelled') continue; // leave voided invoices alone

      const sumRaw = await tx.execute<{ s: string }>(sql`
        SELECT COALESCE(SUM(amount), 0)::text AS s FROM receipt_allocations
        WHERE invoice_id = ${inv.id} AND tenant_id = ${TENANT_ID}
      `);
      const cashAlloc = Number((((sumRaw as unknown) as { rows: any[] }).rows)[0]?.s ?? '0');
      const cnAmt = cnByInv.get(inv.id) ?? 0;
      const total = Number(inv.total_amount);
      const received = cashAlloc + cnAmt;
      const balance = Math.max(0, total - received);

      let newStatus: string;
      if (balance <= 0.005) newStatus = 'paid';
      else if (received > 0.005) newStatus = 'partially_paid';
      else newStatus = 'sent';

      await tx.execute(sql`
        UPDATE sales_invoices
        SET amount_received = ${received.toFixed(2)},
            balance_due     = ${balance.toFixed(2)},
            status          = ${newStatus}::sales_invoice_status,
            updated_at      = NOW()
        WHERE id = ${inv.id} AND tenant_id = ${TENANT_ID}
      `);
    }
  });

  console.log('✓ Allocations rebuilt and invoice balances recomputed.');
}

main().catch(err => { console.error(err); process.exit(1); });
