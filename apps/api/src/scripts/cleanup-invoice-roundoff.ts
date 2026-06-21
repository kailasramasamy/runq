/**
 * Clean up sub-rupee residual balances on invoices that customers settled by
 * paying whole rupees against a paise total (e.g. 260533 ₹0.82, 260558 ₹0.09).
 *
 * These leave an invoice "overdue" forever for a few paise. For each invoice
 * with 0 < balance_due <= ROUND_OFF_MAX it books a round-off write-off
 * (Dr 5606 Round Off / Cr 1103 Accounts Receivable) and closes the invoice:
 * amount_received = total, balance_due = 0, status = paid. Keeps the AR control
 * account tied to the invoice subledger. Idempotent per invoice.
 *
 * Dry-run by default; set RECONCILE_LIVE=1 to commit.
 *
 * Usage:
 *   pnpm --filter @runq/api exec tsx src/scripts/cleanup-invoice-roundoff.ts
 *   RECONCILE_LIVE=1 pnpm --filter @runq/api exec tsx src/scripts/cleanup-invoice-roundoff.ts
 */
import { createDb } from '@runq/db';
import { sql } from 'drizzle-orm';
import { GLService } from '../modules/gl/gl.service';

const TENANT_ID = 'a0365382-afa0-48b6-92cd-4db615a7d98b'; // Vrindavan
const LIVE = process.env.RECONCILE_LIVE === '1';
const ROUND_OFF_MAX = 1; // ₹: keep in sync with receipt.service ROUND_OFF_MAX
const JE_DATE = new Date().toISOString().slice(0, 10);

interface Residual extends Record<string, unknown> { id: string; number: string; total: string; balanceDue: string }

async function main(): Promise<void> {
  const { db, pool } = createDb(process.env.DATABASE_URL!);
  await db.execute(sql.raw(`SET app.current_tenant_id = '${TENANT_ID}'`));

  console.log('━'.repeat(72));
  console.log(`Cleanup invoice round-off residuals — ${LIVE ? '🔴 LIVE' : '🟢 DRY-RUN'}`);
  console.log('━'.repeat(72));

  const rows = await db.execute<Residual>(sql`
    SELECT id, invoice_number AS number, total_amount AS total, balance_due AS "balanceDue"
    FROM sales_invoices
    WHERE tenant_id = ${TENANT_ID}
      AND status NOT IN ('paid', 'cancelled', 'draft')
      AND balance_due::numeric > 0.005
      AND balance_due::numeric <= ${ROUND_OFF_MAX}
    ORDER BY invoice_number`);
  const residuals = rows.rows as unknown as Residual[];

  if (residuals.length === 0) {
    console.log('\nNo residual balances ≤ ₹1 found. Nothing to do.');
    await pool.end();
    return;
  }

  let total = 0;
  for (const r of residuals) {
    const bal = Number(r.balanceDue);
    total += bal;
    console.log(`   ${r.number}  balance ₹${bal.toFixed(2)}  (total ₹${Number(r.total).toFixed(2)}) → write off, mark paid`);
  }
  console.log(`\n${residuals.length} invoice(s), total round-off ₹${total.toFixed(2)} → Dr 5606 Round Off / Cr 1103 AR`);

  if (!LIVE) {
    console.log('\nDry-run only. Set RECONCILE_LIVE=1 to commit.');
    await pool.end();
    return;
  }

  const gl = new GLService(db, TENANT_ID);
  for (const r of residuals) {
    await gl.postInvoiceRoundOff({ invoiceId: r.id, amount: Number(r.balanceDue), date: JE_DATE, reference: r.number });
    await db.execute(sql`
      UPDATE sales_invoices
      SET amount_received = total_amount, balance_due = 0, status = 'paid', updated_at = NOW()
      WHERE id = ${r.id} AND tenant_id = ${TENANT_ID}`);
    console.log(`   ✓ ${r.number} closed`);
  }

  console.log(`\n✓ ${residuals.length} invoice(s) cleaned up.`);
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
