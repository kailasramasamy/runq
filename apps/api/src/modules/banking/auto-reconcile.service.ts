import { eq, and } from 'drizzle-orm';
import { bankTransactions, salesInvoices, purchaseInvoices, paymentReceipts, receiptAllocations, payments, paymentAllocations } from '@runq/db';
import type { Db } from '@runq/db';
import { NotFoundError, ConflictError } from '../../utils/errors';
import { toNumber } from '../../utils/decimal';

type BankTxn = typeof bankTransactions.$inferSelect;

function computeStatus(total: number, paid: number): 'paid' | 'partially_paid' {
  return total - paid <= 0.01 ? 'paid' : 'partially_paid';
}

export class AutoReconcileService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  async processMatch(bankTransactionId: string, matchType: 'receipt' | 'payment', invoiceId: string): Promise<{ created: string }> {
    const [txn] = await this.db.select().from(bankTransactions)
      .where(and(eq(bankTransactions.id, bankTransactionId), eq(bankTransactions.tenantId, this.tenantId)))
      .limit(1);
    if (!txn) throw new NotFoundError('Bank transaction');
    if (txn.reconStatus !== 'unreconciled') throw new ConflictError('Bank transaction is already reconciled');

    const amount = toNumber(txn.amount);
    return matchType === 'receipt'
      ? this.createReceipt(txn, invoiceId, amount)
      : this.createPayment(txn, invoiceId, amount);
  }

  private async createReceipt(txn: BankTxn, invoiceId: string, amount: number): Promise<{ created: string }> {
    const [inv] = await this.db.select().from(salesInvoices)
      .where(and(eq(salesInvoices.id, invoiceId), eq(salesInvoices.tenantId, this.tenantId))).limit(1);
    if (!inv) throw new NotFoundError('Sales invoice');

    return this.db.transaction(async (tx) => {
      const [receipt] = await tx.insert(paymentReceipts).values({
        tenantId: this.tenantId, customerId: inv.customerId, bankAccountId: txn.bankAccountId,
        receiptDate: txn.transactionDate, amount: String(amount), paymentMethod: 'bank_transfer',
        referenceNumber: txn.reference, notes: `Auto-reconciled from bank txn ${txn.reference ?? txn.id}`,
      }).returning();

      await tx.insert(receiptAllocations).values({
        tenantId: this.tenantId, receiptId: receipt!.id, invoiceId, amount: String(amount),
      });

      const newReceived = toNumber(inv.amountReceived) + amount;
      const newBalance = Math.max(0, toNumber(inv.totalAmount) - newReceived);
      await tx.update(salesInvoices)
        .set({ amountReceived: String(newReceived), balanceDue: String(newBalance), status: computeStatus(toNumber(inv.totalAmount), newReceived), updatedAt: new Date() })
        .where(eq(salesInvoices.id, invoiceId));

      await this.markMatched(tx, txn.id);
      return { created: receipt!.id };
    });
  }

  private async createPayment(txn: BankTxn, invoiceId: string, amount: number): Promise<{ created: string }> {
    const [inv] = await this.db.select().from(purchaseInvoices)
      .where(and(eq(purchaseInvoices.id, invoiceId), eq(purchaseInvoices.tenantId, this.tenantId))).limit(1);
    if (!inv) throw new NotFoundError('Purchase invoice');

    return this.db.transaction(async (tx) => {
      const [payment] = await tx.insert(payments).values({
        tenantId: this.tenantId, vendorId: inv.vendorId, bankAccountId: txn.bankAccountId,
        paymentDate: txn.transactionDate, amount: String(amount), paymentMethod: 'bank_transfer',
        utrNumber: txn.reference, status: 'completed',
        notes: `Auto-reconciled from bank txn ${txn.reference ?? txn.id}`,
      }).returning();

      await tx.insert(paymentAllocations).values({
        tenantId: this.tenantId, paymentId: payment!.id, invoiceId, amount: String(amount),
      });

      const newPaid = toNumber(inv.amountPaid) + amount;
      const newBalance = Math.max(0, toNumber(inv.totalAmount) - newPaid);
      await tx.update(purchaseInvoices)
        .set({ amountPaid: String(newPaid), balanceDue: String(newBalance), status: computeStatus(toNumber(inv.totalAmount), newPaid), updatedAt: new Date() })
        .where(eq(purchaseInvoices.id, invoiceId));

      await this.markMatched(tx, txn.id);
      return { created: payment!.id };
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async markMatched(tx: any, txnId: string): Promise<void> {
    await tx.update(bankTransactions).set({ reconStatus: 'matched', updatedAt: new Date() }).where(eq(bankTransactions.id, txnId));
  }
}
