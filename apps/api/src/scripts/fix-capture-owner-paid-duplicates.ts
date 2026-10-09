/**
 * One-shot repair: bills marked "paid" from mobile (record-owner-payment) for
 * money the user had already logged via "Payment made".
 *
 * Each such pair booked the expense twice (capture → Dr expense / Cr bank,
 * bill → Dr expense / Cr AP) and settled AP with phantom owner's capital
 * (Dr 1102 / Cr 3005, Dr 2101 / Cr 1102). Per pair this script:
 *   1. unwinds the owner payment — allocation removed, bill balance restored,
 *      payment + its owner_injection / payment JEs marked reversed;
 *   2. settles the bill with the capture via CaptureSettlementService, which
 *      reverses the capture's bank-line expense JE (if matched) and posts
 *      Dr 2101 / Cr bank against the real bank account.
 *
 * Pairs: owner-paid payment with one allocation + a capture of the same amount
 * within ±14 days, not yet linked. Ambiguous pairings are skipped.
 *
 * Run dry:   tsx --env-file=../../.env src/scripts/fix-capture-owner-paid-duplicates.ts
 * Run apply: tsx --env-file=../../.env src/scripts/fix-capture-owner-paid-duplicates.ts --apply
 */
import { eq, and, inArray, sql } from 'drizzle-orm';
import { createDb, payments, paymentAllocations, purchaseInvoices, journalEntries } from '@runq/db';
import type { Db } from '@runq/db';
import { CaptureSettlementService } from '../modules/ap/capture-settlement.service';

const PAIR_WINDOW_DAYS = 14;

interface Pair {
  tenant_id: string; tenant: string; owner_payment_id: string; bill_id: string; invoice_number: string;
  vendor: string; amount: string; owner_paid_on: string; capture_id: string; capture_date: string;
  capture_status: string; payee_name: string | null;
}

async function findPairs(db: Db): Promise<Pair[]> {
  const res = await db.execute(sql`
    WITH owner_paid AS (
      SELECT p.id, p.tenant_id, p.amount, p.payment_date, MIN(pa.invoice_id::text)::uuid AS bill_id
      FROM payments p
      JOIN payment_allocations pa ON pa.payment_id = p.id
      WHERE p.status = 'completed' AND p.notes LIKE 'Owner-paid%'
      GROUP BY p.id HAVING COUNT(*) = 1
    ), pairs AS (
      SELECT op.*, pp.id AS capture_id, pp.payment_date AS capture_date, pp.status AS capture_status, pp.payee_name,
             COUNT(*) OVER (PARTITION BY op.id) AS n_captures,
             COUNT(*) OVER (PARTITION BY pp.id) AS n_payments
      FROM owner_paid op
      JOIN pending_payments pp ON pp.tenant_id = op.tenant_id
        AND pp.payment_id IS NULL AND pp.status IN ('pending', 'matched')
        AND ABS(pp.amount - op.amount) < 0.01
        AND ABS(pp.payment_date - op.payment_date) <= ${PAIR_WINDOW_DAYS}
    )
    SELECT x.tenant_id, t.name AS tenant, x.id AS owner_payment_id, x.bill_id, pi.invoice_number, v.name AS vendor,
           x.amount, x.payment_date AS owner_paid_on, x.capture_id, x.capture_date, x.capture_status, x.payee_name
    FROM pairs x
    JOIN tenants t ON t.id = x.tenant_id
    JOIN purchase_invoices pi ON pi.id = x.bill_id
    JOIN vendors v ON v.id = pi.vendor_id
    WHERE x.n_captures = 1 AND x.n_payments = 1
    ORDER BY x.capture_date`);
  return (res as unknown as { rows: Pair[] }).rows;
}

/** Undo record-owner-payment: restore the bill and reverse its two JEs. */
async function unwindOwnerPayment(tx: Db, pair: Pair): Promise<void> {
  const amount = parseFloat(pair.amount);
  const [bill] = await tx.select().from(purchaseInvoices).where(eq(purchaseInvoices.id, pair.bill_id)).limit(1);
  if (!bill) throw new Error(`bill ${pair.bill_id} missing`);
  const newPaid = Math.max(0, parseFloat(bill.amountPaid) - amount);
  await tx.update(purchaseInvoices).set({
    amountPaid: String(Math.round(newPaid * 100) / 100),
    balanceDue: String(Math.round((parseFloat(bill.balanceDue) + amount) * 100) / 100),
    status: newPaid <= 0.01 ? 'approved' : 'partially_paid',
    updatedAt: new Date(),
  }).where(eq(purchaseInvoices.id, bill.id));
  await tx.delete(paymentAllocations).where(eq(paymentAllocations.paymentId, pair.owner_payment_id));
  await tx.update(payments).set({ status: 'reversed', updatedAt: new Date() })
    .where(eq(payments.id, pair.owner_payment_id));
  await tx.update(journalEntries).set({ status: 'reversed', updatedAt: new Date() })
    .where(and(
      eq(journalEntries.tenantId, pair.tenant_id),
      eq(journalEntries.sourceId, pair.owner_payment_id),
      inArray(journalEntries.sourceType, ['payment', 'owner_injection']),
    ));
}

async function main() {
  const apply = process.argv.includes('--apply');
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const { db, pool } = createDb(url);
  console.log(apply ? '🔧 APPLY MODE' : '🔍 DRY RUN');

  const pairs = await findPairs(db);
  console.table(pairs.map((p) => ({
    tenant: p.tenant, vendor: p.vendor, bill: p.invoice_number, amount: p.amount,
    ownerPaidOn: p.owner_paid_on, captured: p.capture_date, capture: p.capture_status, payee: p.payee_name,
  })));

  if (apply) {
    for (const pair of pairs) {
      await db.transaction(async (raw) => {
        const tx = raw as unknown as Db;
        await unwindOwnerPayment(tx, pair);
        await new CaptureSettlementService(tx, pair.tenant_id).settle(pair.bill_id, pair.capture_id);
      });
      console.log(`✓ ${pair.vendor} · ${pair.invoice_number} · ₹${pair.amount}`);
    }
  }
  console.log(`\n${pairs.length} pair(s)${apply ? ' repaired' : ' — rerun with --apply to repair'}.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
