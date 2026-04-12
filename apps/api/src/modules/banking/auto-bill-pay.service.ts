import { eq, and, sql } from 'drizzle-orm';
import {
  bankTransactions,
  purchaseInvoices,
  purchaseInvoiceItems,
  payments,
  paymentAllocations,
  reconciliationMatches,
} from '@runq/db';
import type { Db } from '@runq/db';
import { GLService } from '../gl/gl.service';

interface AutoBillPayParams {
  bankTransactionId: string;
  vendorId: string;
  vendorName: string;
  expenseAccountCode: string;
  bankAccountId: string;
  bankGlAccountCode: string;
  amount: number;
  transactionDate: string;
  narration: string | null;
  reference: string | null;
}

interface AutoBillPayResult {
  billId: string;
  paymentId: string;
}

export class AutoBillPayService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  /**
   * Auto-create bill + payment from a bank debit transaction.
   * First checks if an existing unreconciled payment already matches
   * (same vendor + amount + date ±5 days). If so, links to it instead.
   * Returns null if existing payment was matched (no new bill created).
   */
  async createFromBankTxn(params: AutoBillPayParams): Promise<AutoBillPayResult | null> {
    const existingPayment = await this.findExistingPayment(params);
    if (existingPayment) {
      await this.linkToExistingPayment(params.bankTransactionId, existingPayment);
      return null;
    }

    return this.createBillAndPayment(params);
  }

  private async findExistingPayment(params: AutoBillPayParams): Promise<string | null> {
    const [row] = await this.db
      .select({ id: payments.id })
      .from(payments)
      .where(and(
        eq(payments.tenantId, this.tenantId),
        eq(payments.vendorId, params.vendorId),
        sql`ABS(${payments.amount}::numeric - ${params.amount}) < 0.01`,
        sql`ABS(${payments.paymentDate}::date - ${params.transactionDate}::date) <= 5`,
        sql`NOT EXISTS (SELECT 1 FROM reconciliation_matches rm WHERE rm.payment_id = ${payments.id})`,
      ))
      .limit(1);
    return row?.id ?? null;
  }

  private async linkToExistingPayment(bankTransactionId: string, paymentId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.insert(reconciliationMatches).values({
        tenantId: this.tenantId,
        bankTransactionId,
        paymentId,
        matchType: 'auto_amount_date',
      });
      await tx.update(bankTransactions)
        .set({ reconStatus: 'matched', updatedAt: new Date() })
        .where(eq(bankTransactions.id, bankTransactionId));
    });
  }

  private async createBillAndPayment(params: AutoBillPayParams): Promise<AutoBillPayResult> {
    const invoiceNumber = this.generateInvoiceNumber(params.vendorName, params.transactionDate);
    const gl = new GLService(this.db, this.tenantId);

    return this.db.transaction(async (tx) => {
      // 1. Create purchase invoice (bill) — directly as 'paid'
      const [bill] = await tx.insert(purchaseInvoices).values({
        tenantId: this.tenantId,
        vendorId: params.vendorId,
        invoiceNumber,
        invoiceDate: params.transactionDate,
        dueDate: params.transactionDate,
        subtotal: String(params.amount),
        totalAmount: String(params.amount),
        amountPaid: String(params.amount),
        balanceDue: '0',
        status: 'paid',
      }).returning();

      // 2. Create line item
      await tx.insert(purchaseInvoiceItems).values({
        tenantId: this.tenantId,
        invoiceId: bill!.id,
        itemName: params.narration ?? `Purchase from ${params.vendorName}`,
        quantity: '1',
        unitPrice: String(params.amount),
        amount: String(params.amount),
      });

      // 3. Create payment — directly as 'completed'
      const [payment] = await tx.insert(payments).values({
        tenantId: this.tenantId,
        vendorId: params.vendorId,
        bankAccountId: params.bankAccountId,
        paymentDate: params.transactionDate,
        amount: String(params.amount),
        paymentMethod: 'bank_transfer',
        utrNumber: params.reference,
        status: 'completed',
        notes: `Auto-created from bank transaction`,
      }).returning();

      // 4. Link payment to bill
      await tx.insert(paymentAllocations).values({
        tenantId: this.tenantId,
        paymentId: payment!.id,
        invoiceId: bill!.id,
        amount: String(params.amount),
      });

      // 5. Link bank transaction → payment
      await tx.insert(reconciliationMatches).values({
        tenantId: this.tenantId,
        bankTransactionId: params.bankTransactionId,
        paymentId: payment!.id,
        matchType: 'auto_amount_date',
      });

      // 6. Mark bank transaction as reconciled
      await tx.update(bankTransactions)
        .set({ reconStatus: 'matched', updatedAt: new Date() })
        .where(eq(bankTransactions.id, params.bankTransactionId));

      return { billId: bill!.id, paymentId: payment!.id };
    }).then(async (result) => {
      // 7. Post JEs (outside the main txn — GLService uses its own transaction)
      await gl.postPurchaseInvoice({
        totalAmount: params.amount,
        date: params.transactionDate,
        id: result.billId,
        vendorName: params.vendorName,
        expenseAccountCode: params.expenseAccountCode,
      });
      await gl.postPayment({
        amount: params.amount,
        date: params.transactionDate,
        id: result.paymentId,
        vendorName: params.vendorName,
        bankAccountCode: params.bankGlAccountCode,
      });
      return result;
    });
  }

  private generateInvoiceNumber(vendorName: string, date: string): string {
    const initials = vendorName
      .split(/\s+/)
      .map((w) => w[0]?.toUpperCase())
      .filter(Boolean)
      .join('')
      .slice(0, 4);
    const d = new Date(date);
    const yymm = `${String(d.getFullYear()).slice(-2)}${String(d.getMonth() + 1).padStart(2, '0')}`;
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `BILL-${initials}-${yymm}-${rand}`;
  }
}
