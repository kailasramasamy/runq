import { eq, and, sql } from 'drizzle-orm';
import {
  bankTransactions,
  salesInvoices,
  paymentReceipts,
  receiptAllocations,
  reconciliationMatches,
  accounts,
} from '@runq/db';
import type { Db } from '@runq/db';
import { GLService } from '../gl/gl.service';

interface AutoReceiptParams {
  bankTransactionId: string;
  customerId: string;
  customerName: string;
  bankAccountId: string;
  bankGlAccountCode: string;
  amount: number;
  transactionDate: string;
  narration: string | null;
  reference: string | null;
}

interface AutoReceiptResult {
  receiptId: string;
  allocations: { invoiceId: string; amount: number; status: 'paid' | 'partially_paid' }[];
  unallocated: number;
}

export class AutoReceiptService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  /**
   * Auto-create receipt from a bank credit transaction and allocate to
   * outstanding invoices using FIFO (oldest-first) waterfall.
   *
   * 1. Existing unreconciled receipt matches → link bank txn to it.
   * 2. Unpaid invoices exist → create receipt, waterfall-allocate oldest-first.
   *    If payment partially covers an invoice, that invoice becomes partially_paid.
   * 3. No invoices → tag bank txn with customerId but leave unreconciled
   *    so the user can create the invoice first, then reconcile manually.
   */
  async createFromBankTxn(params: AutoReceiptParams): Promise<AutoReceiptResult | null> {
    const [arGl] = await this.db.select({ id: accounts.id }).from(accounts)
      .where(and(eq(accounts.tenantId, this.tenantId), eq(accounts.code, '1103'))).limit(1);
    const arGlId = arGl?.id ?? null;

    // 1. Existing receipt? Just link bank txn to it
    const existingReceipt = await this.findExistingReceipt(params);
    if (existingReceipt) {
      await this.linkToExistingReceipt(params.bankTransactionId, existingReceipt, params.customerId, arGlId);
      return null;
    }

    // 2. Fetch all unpaid invoices for this customer (oldest first)
    const invoices = await this.findUnpaidInvoices(params.customerId);
    if (invoices.length > 0) {
      return this.createReceiptWithAllocations(params, invoices, arGlId);
    }

    // 3. No invoices — just tag with customerId, leave unreconciled for manual handling.
    //    Don't create receipt/GL without an invoice to offset against.
    await this.db.update(bankTransactions)
      .set({ customerId: params.customerId, glAccountId: arGlId, updatedAt: new Date() })
      .where(eq(bankTransactions.id, params.bankTransactionId));
    return null;
  }

  private async findExistingReceipt(params: AutoReceiptParams): Promise<string | null> {
    const [row] = await this.db
      .select({ id: paymentReceipts.id })
      .from(paymentReceipts)
      .where(and(
        eq(paymentReceipts.tenantId, this.tenantId),
        eq(paymentReceipts.customerId, params.customerId),
        sql`ABS(${paymentReceipts.amount}::numeric - ${params.amount}) < 0.01`,
        sql`ABS(${paymentReceipts.receiptDate}::date - ${params.transactionDate}::date) <= 5`,
        sql`NOT EXISTS (SELECT 1 FROM reconciliation_matches rm WHERE rm.receipt_id = ${paymentReceipts.id})`,
      ))
      .limit(1);
    return row?.id ?? null;
  }

  private async findUnpaidInvoices(customerId: string): Promise<{ id: string; balanceDue: string }[]> {
    return this.db
      .select({ id: salesInvoices.id, balanceDue: salesInvoices.balanceDue })
      .from(salesInvoices)
      .where(and(
        eq(salesInvoices.tenantId, this.tenantId),
        eq(salesInvoices.customerId, customerId),
        sql`${salesInvoices.balanceDue}::numeric > 0`,
        sql`${salesInvoices.status} NOT IN ('cancelled', 'draft')`,
      ))
      .orderBy(salesInvoices.invoiceDate);
  }

  /**
   * Waterfall allocation: walk invoices oldest-first, fully pay each until
   * the receipt amount runs out. The last touched invoice may be partially paid.
   */
  private async createReceiptWithAllocations(
    params: AutoReceiptParams,
    invoices: { id: string; balanceDue: string }[],
    arGlId: string | null,
  ): Promise<AutoReceiptResult> {
    const gl = new GLService(this.db, this.tenantId);

    const result = await this.db.transaction(async (tx) => {
      // Create single receipt for the full bank amount
      const [receipt] = await tx.insert(paymentReceipts).values({
        tenantId: this.tenantId,
        customerId: params.customerId,
        bankAccountId: params.bankAccountId,
        receiptDate: params.transactionDate,
        amount: String(params.amount),
        paymentMethod: 'bank_transfer',
        referenceNumber: params.reference,
        notes: `Auto-created from bank transaction`,
      }).returning();

      const receiptId = receipt!.id;
      let remaining = params.amount;
      const allocations: AutoReceiptResult['allocations'] = [];

      // Waterfall: oldest invoice first
      for (const inv of invoices) {
        if (remaining <= 0.01) break;

        const balance = parseFloat(inv.balanceDue);
        const allocAmount = Math.min(remaining, balance);
        const newBalance = balance - allocAmount;
        const newStatus: 'paid' | 'partially_paid' = newBalance <= 0.01 ? 'paid' : 'partially_paid';

        await tx.insert(receiptAllocations).values({
          tenantId: this.tenantId,
          receiptId,
          invoiceId: inv.id,
          amount: String(Math.round(allocAmount * 100) / 100),
        });

        await tx.update(salesInvoices).set({
          amountReceived: sql`${salesInvoices.amountReceived}::numeric + ${allocAmount}`,
          balanceDue: String(Math.max(0, Math.round(newBalance * 100) / 100)),
          status: newStatus,
          updatedAt: new Date(),
        }).where(eq(salesInvoices.id, inv.id));

        allocations.push({ invoiceId: inv.id, amount: allocAmount, status: newStatus });
        remaining -= allocAmount;
      }

      // Link bank txn
      await tx.insert(reconciliationMatches).values({
        tenantId: this.tenantId,
        bankTransactionId: params.bankTransactionId,
        receiptId,
        matchType: 'auto_amount_date',
      });

      await tx.update(bankTransactions)
        .set({ customerId: params.customerId, glAccountId: arGlId, reconStatus: 'matched', updatedAt: new Date() })
        .where(eq(bankTransactions.id, params.bankTransactionId));

      return { receiptId, allocations, unallocated: Math.round(remaining * 100) / 100 };
    });

    // Post receipt JE for the full amount
    await gl.postReceipt({
      amount: params.amount,
      date: params.transactionDate,
      id: result.receiptId,
      customerName: params.customerName,
    });

    return result;
  }

  private async linkToExistingReceipt(
    bankTransactionId: string,
    receiptId: string,
    customerId: string,
    arGlId: string | null,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.insert(reconciliationMatches).values({
        tenantId: this.tenantId,
        bankTransactionId,
        receiptId,
        matchType: 'auto_amount_date',
      });
      await tx.update(bankTransactions)
        .set({ customerId, glAccountId: arGlId, reconStatus: 'matched', updatedAt: new Date() })
        .where(eq(bankTransactions.id, bankTransactionId));
    });
  }
}
