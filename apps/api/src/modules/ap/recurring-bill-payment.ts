import { and, asc, eq, gt, inArray } from 'drizzle-orm';
import { purchaseInvoices, recurringBills, payments, paymentAllocations, advancePayments } from '@runq/db';
import type { Db } from '@runq/db';
import type { RecordRecurringPaymentInput } from '@runq/validators';
import { ConflictError, NotFoundError, ValidationError } from '../../utils/errors';
import { PaymentService } from './payment.service';

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Split a payment across open months, oldest first. Whatever the months don't
 * absorb is the advance. Pure so the split is testable without a database.
 */
export function splitPayment(
  amount: number, open: Array<{ id: string; balanceDue: number }>,
): { allocations: Array<{ invoiceId: string; amount: number }>; advance: number } {
  let left = r2(amount);
  const allocations = [];
  for (const bill of open) {
    if (left <= 0) break;
    const take = r2(Math.min(left, bill.balanceDue));
    if (take <= 0) continue;
    allocations.push({ invoiceId: bill.id, amount: take });
    left = r2(left - take);
  }
  return { allocations, advance: left };
}

/**
 * The bills to settle, in order: the ones the payer chose (each must be one of
 * this agreement's open bills), or every open bill oldest first.
 */
export function pickBills(
  open: Array<{ id: string; balanceDue: string }>, chosen?: string[],
): Array<{ id: string; balanceDue: number }> {
  const byId = new Map(open.map((o) => [o.id, { id: o.id, balanceDue: Number(o.balanceDue) }]));
  if (!chosen?.length) return [...byId.values()];
  return chosen.map((id) => {
    const bill = byId.get(id);
    if (!bill) throw new ValidationError('A chosen period is already paid or not part of this agreement');
    return bill;
  });
}

/**
 * Pay a rent / transport agreement. Settles its oldest unpaid months first
 * (a part payment simply leaves the month partially paid); anything beyond
 * what's due — or all of it, when `asAdvance` — becomes a vendor advance that
 * the next months' bills draw down when they're raised. Both legs are
 * completed (and posted) immediately: the money has already left the bank.
 */
export async function recordRecurringPayment(
  db: Db, tenantId: string, agreementId: string, input: RecordRecurringPaymentInput, userId: string,
) {
  const [a] = await db.select().from(recurringBills)
    .where(and(eq(recurringBills.tenantId, tenantId), eq(recurringBills.id, agreementId)));
  if (!a) throw new NotFoundError('Recurring bill');

  const open = input.asAdvance ? [] : await db
    .select({ id: purchaseInvoices.id, balanceDue: purchaseInvoices.balanceDue })
    .from(purchaseInvoices)
    .where(and(
      eq(purchaseInvoices.tenantId, tenantId),
      eq(purchaseInvoices.recurringBillId, agreementId),
      inArray(purchaseInvoices.status, ['approved', 'partially_paid']),
      gt(purchaseInvoices.balanceDue, '0'),
    ))
    .orderBy(asc(purchaseInvoices.recurringPeriod));
  const split = splitPayment(input.amount, pickBills(open, input.asAdvance ? undefined : input.billIds));

  const payments = new PaymentService(db, tenantId);
  const common = {
    vendorId: a.vendorId,
    bankAccountId: input.bankAccountId,
    paymentMethod: 'bank_transfer' as const,
    referenceNumber: input.referenceNumber ?? null,
    paymentDate: input.paymentDate,
    notes: input.notes ?? null,
  };
  if (split.allocations.length) {
    const paid = r2(input.amount - split.advance);
    const p = await payments.createPayment({ ...common, totalAmount: paid, allocations: split.allocations }, userId);
    await payments.approvePayment(p.id, userId);
  }
  if (split.advance > 0) {
    const adv = await payments.createAdvancePayment({ ...common, amount: split.advance });
    // createAdvancePayment always links its payment row.
    await payments.approvePayment(adv.paymentId!, userId);
  }
  return { paidToBills: r2(input.amount - split.advance), heldAsAdvance: split.advance };
}

/**
 * Cancel a payment recorded against an agreement: its months go back to due
 * and its GL entry is reversed (AP's reversePayment). An advance that a bill
 * has already drawn down can't be pulled back this way — that draw-down was
 * posted against the bill — so it is refused with the period that used it.
 */
export async function cancelRecurringPayment(
  db: Db, tenantId: string, agreementId: string, paymentId: string, userId: string,
) {
  const [a] = await db.select({ vendorId: recurringBills.vendorId }).from(recurringBills)
    .where(and(eq(recurringBills.tenantId, tenantId), eq(recurringBills.id, agreementId)));
  if (!a) throw new NotFoundError('Recurring bill');
  const [p] = await db.select({ id: payments.id, status: payments.status }).from(payments)
    .where(and(eq(payments.tenantId, tenantId), eq(payments.id, paymentId), eq(payments.vendorId, a.vendorId)));
  if (!p) throw new NotFoundError('Payment');
  if (p.status === 'reversed') throw new ConflictError('This payment is already cancelled');

  const [advance] = await db.select({ id: advancePayments.id }).from(advancePayments)
    .where(eq(advancePayments.paymentId, paymentId)).limit(1);
  if (advance) {
    const used = await db
      .select({ number: purchaseInvoices.invoiceNumber })
      .from(paymentAllocations)
      .innerJoin(purchaseInvoices, eq(purchaseInvoices.id, paymentAllocations.invoiceId))
      .where(eq(paymentAllocations.paymentId, paymentId));
    if (used.length) {
      throw new ConflictError(
        `This advance was already used by bill ${used.map((u) => u.number).join(', ')} — it can't be cancelled`,
      );
    }
  }
  await new PaymentService(db, tenantId).reversePayment(paymentId, userId, 'Cancelled from rent & transport');
  return { id: paymentId, cancelled: true };
}
