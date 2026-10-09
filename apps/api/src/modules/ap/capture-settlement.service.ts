import { eq, and, isNull, inArray, sql } from 'drizzle-orm';
import {
  purchaseInvoices,
  payments,
  paymentAllocations,
  pendingPayments,
  bankAccounts,
  bankTransactions,
  accounts,
  journalEntries,
  reconciliationMatches,
  vendors,
} from '@runq/db';
import type { Db } from '@runq/db';
import { GLService } from '../gl/gl.service';
import { NotFoundError, ConflictError } from '../../utils/errors';

type Bill = typeof purchaseInvoices.$inferSelect;
type Capture = typeof pendingPayments.$inferSelect;

/**
 * Settles a vendor bill with a payment already captured via "Payment made",
 * instead of recording a second payment for the same money. The capture
 * becomes a real AP payment from its bank account (Dr AP / Cr Bank), so the
 * bill carries the expense and the capture's category is never posted:
 *   - capture still pending: the later bank match links the bank line to this
 *     payment (PendingPaymentMatchService) rather than posting an expense.
 *   - capture already matched: the bank line's direct-expense JE is reversed
 *     and the line is re-linked to the payment.
 */
export class CaptureSettlementService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  async settle(billId: string, pendingPaymentId: string): Promise<{ paymentId: string }> {
    const bill = await this.loadBill(billId);
    const capture = await this.loadCapture(pendingPaymentId);
    const amount = parseFloat(capture.amount);
    if (amount > parseFloat(bill.balanceDue) + 0.01) {
      throw new ConflictError(`Payment ₹${capture.amount} exceeds the bill's balance due ₹${bill.balanceDue}`);
    }
    const [bankGlCode, vendorName, date] = await Promise.all([
      this.bankGlCode(capture.bankAccountId),
      this.vendorName(bill.vendorId),
      this.paymentDate(capture),
    ]);

    const paymentId = await this.db.transaction(async (raw) => {
      const tx = raw as unknown as Db;
      const id = await this.insertPayment(tx, bill, capture, amount, date);
      await this.claimCapture(tx, capture.id, id);
      if (capture.matchedBankTransactionId) {
        await this.relinkBankLine(tx, capture.matchedBankTransactionId, id, bill.vendorId);
      }
      await new GLService(tx, this.tenantId).postPayment({
        amount, date, id, vendorName, bankAccountCode: bankGlCode,
      });
      return id;
    });
    return { paymentId };
  }

  private async loadBill(billId: string): Promise<Bill> {
    const [bill] = await this.db.select().from(purchaseInvoices)
      .where(and(eq(purchaseInvoices.id, billId), eq(purchaseInvoices.tenantId, this.tenantId))).limit(1);
    if (!bill) throw new NotFoundError('PurchaseInvoice');
    if (bill.status !== 'approved' && bill.status !== 'partially_paid') {
      throw new ConflictError('Approve the bill before linking a payment to it');
    }
    return bill;
  }

  private async loadCapture(id: string): Promise<Capture> {
    const [capture] = await this.db.select().from(pendingPayments)
      .where(and(eq(pendingPayments.id, id), eq(pendingPayments.tenantId, this.tenantId))).limit(1);
    if (!capture) throw new NotFoundError('Pending payment');
    if (capture.status === 'cancelled') throw new ConflictError('This payment was cancelled');
    if (capture.paymentId) throw new ConflictError('This payment is already linked to a bill');
    return capture;
  }

  private async bankGlCode(bankAccountId: string): Promise<string> {
    const [row] = await this.db.select({ code: accounts.code }).from(bankAccounts)
      .innerJoin(accounts, eq(bankAccounts.glAccountId, accounts.id))
      .where(and(eq(bankAccounts.id, bankAccountId), eq(bankAccounts.tenantId, this.tenantId))).limit(1);
    if (!row) throw new ConflictError('The payment\'s bank account has no GL account');
    return row.code;
  }

  private async vendorName(vendorId: string): Promise<string> {
    const [row] = await this.db.select({ name: vendors.name }).from(vendors).where(eq(vendors.id, vendorId)).limit(1);
    if (!row) throw new NotFoundError('Vendor');
    return row.name;
  }

  /** A matched capture pays on its bank line's date; a pending one on the captured date. */
  private async paymentDate(capture: Capture): Promise<string> {
    if (!capture.matchedBankTransactionId) return capture.paymentDate;
    const [txn] = await this.db.select({ date: bankTransactions.transactionDate }).from(bankTransactions)
      .where(eq(bankTransactions.id, capture.matchedBankTransactionId)).limit(1);
    return txn?.date ?? capture.paymentDate;
  }

  private async insertPayment(tx: Db, bill: Bill, capture: Capture, amount: number, date: string): Promise<string> {
    const [payment] = await tx.insert(payments).values({
      tenantId: this.tenantId,
      vendorId: bill.vendorId,
      bankAccountId: capture.bankAccountId,
      paymentDate: date,
      amount: capture.amount,
      paymentMethod: 'bank_transfer',
      utrNumber: capture.upiRef,
      status: 'completed',
      notes: 'Linked from captured payment (Payment made)',
    }).returning({ id: payments.id });

    await tx.insert(paymentAllocations).values({
      tenantId: this.tenantId,
      paymentId: payment!.id,
      invoiceId: bill.id,
      amount: capture.amount,
    });

    const newBalance = parseFloat(bill.balanceDue) - amount;
    await tx.update(purchaseInvoices).set({
      amountPaid: sql`${purchaseInvoices.amountPaid}::numeric + ${amount}`,
      balanceDue: String(Math.max(0, Math.round(newBalance * 100) / 100)),
      status: newBalance <= 0.01 ? 'paid' : 'partially_paid',
      updatedAt: new Date(),
    }).where(eq(purchaseInvoices.id, bill.id));
    return payment!.id;
  }

  /** Conditional claim so two concurrent links can't both use one capture. */
  private async claimCapture(tx: Db, captureId: string, paymentId: string): Promise<void> {
    const [row] = await tx.update(pendingPayments)
      .set({ paymentId, updatedAt: new Date() })
      .where(and(
        eq(pendingPayments.id, captureId),
        eq(pendingPayments.tenantId, this.tenantId),
        isNull(pendingPayments.paymentId),
        inArray(pendingPayments.status, ['pending', 'matched']),
      ))
      .returning({ id: pendingPayments.id });
    if (!row) throw new ConflictError('This payment is already linked to a bill');
  }

  /** Swap the bank line's direct-expense JE for a link to the AP payment. */
  private async relinkBankLine(tx: Db, txnId: string, paymentId: string, vendorId: string): Promise<void> {
    const [existing] = await tx.select({ id: reconciliationMatches.id }).from(reconciliationMatches)
      .where(and(eq(reconciliationMatches.tenantId, this.tenantId), eq(reconciliationMatches.bankTransactionId, txnId)))
      .limit(1);
    if (existing) throw new ConflictError('The bank line is already reconciled to another payment');

    await tx.update(journalEntries)
      .set({ status: 'reversed', updatedAt: new Date() })
      .where(and(
        eq(journalEntries.tenantId, this.tenantId),
        eq(journalEntries.sourceType, 'bank_debit'),
        eq(journalEntries.sourceId, txnId),
        eq(journalEntries.status, 'posted'),
      ));
    await tx.insert(reconciliationMatches).values({
      tenantId: this.tenantId,
      bankTransactionId: txnId,
      paymentId,
      matchType: 'manual',
    });
    await tx.update(bankTransactions)
      .set({ vendorId, journalEntryId: null, reconStatus: 'matched', updatedAt: new Date() })
      .where(and(eq(bankTransactions.id, txnId), eq(bankTransactions.tenantId, this.tenantId)));
  }
}
