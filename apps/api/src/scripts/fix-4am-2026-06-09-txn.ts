/**
 * Correct two mis-allocated 4am (Think FreshFirst) bank receipts.
 *
 * What went wrong (auto-FIFO has no remittance advice):
 *  - 2026-06-05 ₹10,000 ("truck advance") was a TRANSPORT advance with no
 *    invoice raised. runq's FIFO waterfall spread it over the oldest open
 *    invoices (260454 ₹1,842.06, 260459 ₹3,919.69, 260460 ₹4,238.25).
 *  - 2026-06-09 ₹173,742 ("vendor payment") was meant for the 23 invoices in
 *    4am-2026-06-09-txn.xlsx. Because the truck advance had already eaten the
 *    head of the FIFO queue, the ₹173,742 drifted forward and wrongly paid a
 *    non-remittance invoice (260547 ₹5,058.83), leaving ₹3,098.29 unallocated.
 *
 * Correct end-state:
 *  - ₹173,742 receipt  → allocated ONLY to the 23 invoices in the sheet.
 *  - ₹10,000 receipt   → left ON-ACCOUNT (advance from customer), no invoice
 *                        allocation, note updated. Adjust it when Vrindavan
 *                        raises the transport invoice.
 *  - 260454 loses the ₹1,842.06 truck top-up → genuine open balance restored.
 *  - 260547 loses the ₹5,058.83 → back to unpaid (it was never in this batch).
 *
 * Only receipt_allocations + invoice amount_received/balance_due/status change.
 * Receipt-level GL (Dr Bank / Cr AR) is unaffected by re-allocation, so no JE
 * edits — same approach as reallocate-4am-receipts.ts.
 *
 * Usage:
 *   pnpm --filter @runq/api exec tsx src/scripts/fix-4am-2026-06-09-txn.ts
 *   RECONCILE_LIVE=1 pnpm --filter @runq/api exec tsx src/scripts/fix-4am-2026-06-09-txn.ts
 */
import { createDb } from '@runq/db';
import { sql } from 'drizzle-orm';

const TENANT_ID = 'a0365382-afa0-48b6-92cd-4db615a7d98b';
const LIVE = process.env.RECONCILE_LIVE === '1';

const RECEIPT_173742 = 'a77551c7-c60b-4fa9-8d94-64a3c3270c0c';
const RECEIPT_10000 = 'fc585b93-6cb6-4f6d-9b1a-186a6b3a6074';
const RECEIPT_173742_AMOUNT = 173742.0;

// The 23 invoices from 4am-2026-06-09-txn.xlsx — the authoritative remittance.
const SHEET_INVOICES = [
  '260459', '260460', '260465', '260466', '260467', '260503', '260504', '260505',
  '260510', '260511', '260512', '260513', '260518', '260519', '260520', '260525',
  '260526', '260531', '260532', '260533', '260538', '260539', '260540',
];

type Row = Record<string, string>;
const rows = (r: unknown): Row[] => ((r as unknown) as { rows: Row[] }).rows;

async function loadInvoices(db: ReturnType<typeof createDb>['db']) {
  const r = await db.execute(sql`
    SELECT id, invoice_number, total_amount
    FROM sales_invoices
    WHERE tenant_id = ${TENANT_ID}
      AND invoice_number IN (${sql.raw(SHEET_INVOICES.map((n) => `'${n}'`).join(','))})
    ORDER BY invoice_number
  `);
  return rows(r).map((x) => ({ id: x.id, number: x.invoice_number, total: Number(x.total_amount) }));
}

// Allocate each invoice its full total; trim the rounding shortfall (sheet
// totals ₹173,742.82 vs receipt ₹173,742.00) off the largest line so the
// receipt foots exactly. That one invoice carries a sub-rupee balance.
function buildPlan(invs: Array<{ id: string; number: string; total: number }>) {
  const plan = invs.map((i) => ({ ...i, alloc: i.total }));
  const sum = plan.reduce((a, p) => a + p.alloc, 0);
  const shortfall = Math.round((sum - RECEIPT_173742_AMOUNT) * 100) / 100;
  if (shortfall > 0) {
    const biggest = plan.reduce((a, b) => (b.alloc > a.alloc ? b : a));
    biggest.alloc = Math.round((biggest.alloc - shortfall) * 100) / 100;
  }
  return { plan, shortfall };
}

async function printCurrent(db: ReturnType<typeof createDb>['db']) {
  for (const [label, id] of [['₹173,742', RECEIPT_173742], ['₹10,000', RECEIPT_10000]] as const) {
    const r = await db.execute(sql`
      SELECT si.invoice_number n, ra.amount a
      FROM receipt_allocations ra JOIN sales_invoices si ON si.id = ra.invoice_id
      WHERE ra.receipt_id = ${id} ORDER BY si.invoice_number`);
    const list = rows(r);
    const tot = list.reduce((s, x) => s + Number(x.a), 0);
    console.log(`\nCURRENT ${label} receipt → ${list.length} allocations, total ₹${tot.toFixed(2)}`);
    for (const x of list) console.log(`   ${x.n}  ₹${Number(x.a).toFixed(2)}`);
  }
}

async function apply(db: ReturnType<typeof createDb>['db'], plan: Array<{ id: string; alloc: number }>) {
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${TENANT_ID}'`));

    // 1) Wipe allocations on both receipts.
    await tx.execute(sql`DELETE FROM receipt_allocations WHERE receipt_id IN (${RECEIPT_173742}, ${RECEIPT_10000})`);

    // 2) Re-insert the 23 sheet allocations for the ₹173,742 receipt.
    for (const p of plan) {
      await tx.execute(sql`
        INSERT INTO receipt_allocations (tenant_id, receipt_id, invoice_id, amount)
        VALUES (${TENANT_ID}, ${RECEIPT_173742}, ${p.id}, ${p.alloc.toFixed(2)})`);
    }

    // 3) ₹10,000 stays on-account — relabel it so it isn't mistaken for invoice cash.
    await tx.execute(sql`
      UPDATE payment_receipts
      SET notes = 'Transport advance — ON ACCOUNT, no invoice (corrected 2026-06-10)', updated_at = NOW()
      WHERE id = ${RECEIPT_10000} AND tenant_id = ${TENANT_ID}`);

    // 4) Recompute every invoice that could have changed: the 23 sheet invoices
    //    plus the two strays (260454 loses the truck top-up, 260547 un-paid).
    const affected = [...plan.map((p) => `'${p.id}'`)];
    const strays = await tx.execute(sql`
      SELECT id FROM sales_invoices WHERE tenant_id = ${TENANT_ID} AND invoice_number IN ('260454','260547')`);
    for (const s of rows(strays)) affected.push(`'${s.id}'`);

    await tx.execute(sql.raw(`
      UPDATE sales_invoices si SET
        amount_received = c.paid,
        balance_due     = GREATEST(0, si.total_amount - c.paid),
        status          = CASE
          WHEN si.total_amount - c.paid <= 0.005 THEN 'paid'
          WHEN c.paid > 0.005 THEN 'partially_paid'
          ELSE 'sent' END::sales_invoice_status,
        updated_at = NOW()
      FROM (
        SELECT i.id, COALESCE(SUM(ra.amount), 0) paid
        FROM sales_invoices i
        LEFT JOIN receipt_allocations ra ON ra.invoice_id = i.id
        WHERE i.id IN (${affected.join(',')})
        GROUP BY i.id
      ) c
      WHERE si.id = c.id AND si.tenant_id = '${TENANT_ID}'`));
  });
}

async function main(): Promise<void> {
  const { db } = createDb(process.env.DATABASE_URL!);
  await db.execute(sql.raw(`SET app.current_tenant_id = '${TENANT_ID}'`));

  console.log('━'.repeat(72));
  console.log(`Fix 4am 2026-06-09 txn — ${LIVE ? '🔴 LIVE' : '🟢 DRY-RUN'}`);
  console.log('━'.repeat(72));

  await printCurrent(db);

  const invs = await loadInvoices(db);
  if (invs.length !== SHEET_INVOICES.length) {
    throw new Error(`Expected ${SHEET_INVOICES.length} invoices, found ${invs.length}`);
  }
  const { plan, shortfall } = buildPlan(invs);
  const total = plan.reduce((a, p) => a + p.alloc, 0);

  console.log(`\nPLANNED ₹173,742 receipt → 23 sheet invoices, total ₹${total.toFixed(2)}`);
  for (const p of plan) console.log(`   ${p.number}  ₹${p.alloc.toFixed(2)}${p.alloc !== p.total ? `  (sheet total ₹${p.total.toFixed(2)}, −₹${shortfall.toFixed(2)} rounding)` : ''}`);
  console.log(`\nPLANNED ₹10,000 receipt → ON-ACCOUNT (0 invoice allocations)`);
  console.log(`   • 260454 loses ₹1,842.06 truck top-up → balance restored`);
  console.log(`   • 260547 loses ₹5,058.83 → back to unpaid`);

  if (!LIVE) {
    console.log('\nDry-run only. Set RECONCILE_LIVE=1 to commit.');
    return;
  }
  await apply(db, plan);
  console.log('\n✓ Allocations rebuilt; invoice balances recomputed.');
}

main().catch((err) => { console.error(err); process.exit(1); });
