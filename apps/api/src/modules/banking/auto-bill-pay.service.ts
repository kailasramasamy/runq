import { eq, and, sql } from 'drizzle-orm';
import {
  bankTransactions,
  purchaseInvoices,
  payments,
  paymentAllocations,
  reconciliationMatches,
  accounts,
  journalEntries,
} from '@runq/db';
import type { Db } from '@runq/db';
import { GLService } from '../gl/gl.service';
import { AuditService } from '../../utils/audit';

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
  billId: string | null;
  paymentId: string | null;
  journalEntryId?: string;
}

export class AutoBillPayService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  /**
   * Reconcile a vendor-matched bank debit to AP.
   * Three paths, in order:
   *   1. Existing unreconciled payment (same vendor/amount/date ±5d) → link.
   *   2. Existing unpaid bill from the vendor → create payment + allocate.
   *   3. Nothing exists → post direct expense JE (Dr expense, Cr Bank). The
   *      bank txn itself is the source document — most one-off spends (fuel,
   *      parking, courier) never get a formal invoice. If a real bill arrives
   *      later, the user re-categorizes the txn against it manually.
   */
  async createFromBankTxn(params: AutoBillPayParams): Promise<AutoBillPayResult | null> {
    // Resolve expense account ID for tagging the bank transaction
    const [expenseGl] = await this.db.select({ id: accounts.id }).from(accounts)
      .where(and(eq(accounts.tenantId, this.tenantId), eq(accounts.code, params.expenseAccountCode))).limit(1);
    const expenseGlId = expenseGl?.id ?? null;

    // 1. Existing payment? Just link bank txn to it
    const existingPayment = await this.findExistingPayment(params);
    if (existingPayment) {
      await this.linkToExistingPayment(params.bankTransactionId, existingPayment, params.vendorId, expenseGlId);
      await this.logAudit('linked', existingPayment, params, null);
      return null;
    }

    // 2. Existing bill (unpaid/partially paid)? Create payment against it
    const existingBill = await this.findExistingBill(params);
    if (existingBill) {
      const result = await this.createPaymentForBill(params, existingBill, expenseGlId);
      await this.logAudit('matched_existing_bill', result.paymentId!, params, result.billId);
      return result;
    }

    // 3. Nothing exists — post direct expense JE, no bill
    const result = await this.postDirectExpense(params, expenseGlId);
    await this.logAudit('posted_direct_expense', result.journalEntryId ?? '', params, null);
    return result;
  }

  private async logAudit(
    flow: 'linked' | 'matched_existing_bill' | 'posted_direct_expense',
    entityId: string,
    params: AutoBillPayParams,
    billId: string | null,
  ): Promise<void> {
    await new AuditService(this.db, this.tenantId).log({
      action: 'auto_created_from_bank_txn',
      entityType: flow === 'posted_direct_expense' ? 'journal_entry' : 'payment',
      entityId,
      metadata: {
        flow,
        bankTransactionId: params.bankTransactionId,
        vendorId: params.vendorId,
        amount: params.amount,
        billId,
      },
    });
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

  private async findExistingBill(params: AutoBillPayParams): Promise<{ id: string; balanceDue: string } | null> {
    // First try exact amount match within 30 days
    const [exact] = await this.db
      .select({ id: purchaseInvoices.id, balanceDue: purchaseInvoices.balanceDue })
      .from(purchaseInvoices)
      .where(and(
        eq(purchaseInvoices.tenantId, this.tenantId),
        eq(purchaseInvoices.vendorId, params.vendorId),
        sql`ABS(${purchaseInvoices.totalAmount}::numeric - ${params.amount}) < 0.01`,
        sql`${purchaseInvoices.balanceDue}::numeric > 0`,
        sql`ABS(${purchaseInvoices.invoiceDate}::date - ${params.transactionDate}::date) <= 30`,
      ))
      .limit(1);
    if (exact) return exact;

    // Then check for any unpaid bill from this vendor (covers OB partial payments)
    const [any] = await this.db
      .select({ id: purchaseInvoices.id, balanceDue: purchaseInvoices.balanceDue })
      .from(purchaseInvoices)
      .where(and(
        eq(purchaseInvoices.tenantId, this.tenantId),
        eq(purchaseInvoices.vendorId, params.vendorId),
        sql`${purchaseInvoices.balanceDue}::numeric > 0`,
        sql`${purchaseInvoices.status} NOT IN ('cancelled', 'draft')`,
      ))
      .orderBy(purchaseInvoices.invoiceDate)
      .limit(1);
    return any ?? null;
  }

  private async createPaymentForBill(
    params: AutoBillPayParams,
    bill: { id: string; balanceDue: string },
    expenseGlId: string | null,
  ): Promise<AutoBillPayResult> {
    const payAmount = Math.min(params.amount, parseFloat(bill.balanceDue));
    const gl = new GLService(this.db, this.tenantId);

    const paymentId = await this.db.transaction(async (tx) => {
      const [payment] = await tx.insert(payments).values({
        tenantId: this.tenantId,
        vendorId: params.vendorId,
        bankAccountId: params.bankAccountId,
        paymentDate: params.transactionDate,
        amount: String(payAmount),
        paymentMethod: 'bank_transfer',
        utrNumber: params.reference,
        status: 'completed',
        notes: 'Auto-created from bank transaction (matched existing bill)',
      }).returning();

      await tx.insert(paymentAllocations).values({
        tenantId: this.tenantId,
        paymentId: payment!.id,
        invoiceId: bill.id,
        amount: String(payAmount),
      });

      // Update bill balance
      const newBalance = parseFloat(bill.balanceDue) - payAmount;
      await tx.update(purchaseInvoices).set({
        amountPaid: sql`${purchaseInvoices.amountPaid}::numeric + ${payAmount}`,
        balanceDue: String(Math.max(0, newBalance)),
        status: newBalance <= 0.01 ? 'paid' : 'partially_paid',
        updatedAt: new Date(),
      }).where(eq(purchaseInvoices.id, bill.id));

      // Link bank txn
      await tx.insert(reconciliationMatches).values({
        tenantId: this.tenantId,
        bankTransactionId: params.bankTransactionId,
        paymentId: payment!.id,
        matchType: 'auto_amount_date',
      });

      await tx.update(bankTransactions)
        .set({ vendorId: params.vendorId, glAccountId: expenseGlId, reconStatus: 'matched', updatedAt: new Date() })
        .where(eq(bankTransactions.id, params.bankTransactionId));

      return payment!.id;
    });

    // Post payment JE only (bill JE already exists from when bill was created)
    await gl.postPayment({
      amount: payAmount,
      date: params.transactionDate,
      id: paymentId,
      vendorName: params.vendorName,
      bankAccountCode: params.bankGlAccountCode,
    });

    return { billId: bill.id, paymentId };
  }

  private async linkToExistingPayment(bankTransactionId: string, paymentId: string, vendorId: string, expenseGlId: string | null): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.insert(reconciliationMatches).values({
        tenantId: this.tenantId,
        bankTransactionId,
        paymentId,
        matchType: 'auto_amount_date',
      });
      await tx.update(bankTransactions)
        .set({ vendorId, glAccountId: expenseGlId, reconStatus: 'matched', updatedAt: new Date() })
        .where(eq(bankTransactions.id, bankTransactionId));
    });
  }

  /**
   * Post the bank debit as a direct expense against the vendor's expense
   * account. No bill, no payment row — the bank txn itself is the source
   * document. Used for one-off / no-invoice spends (fuel, parking, courier).
   * JE: Dr <vendor.expenseAccountCode>, Cr Bank.
   */
  private async postDirectExpense(
    params: AutoBillPayParams,
    expenseGlId: string | null,
  ): Promise<AutoBillPayResult> {
    const gl = new GLService(this.db, this.tenantId);

    const entry = await gl.createJournalEntry({
      date: params.transactionDate,
      description: `Bank payment — ${params.vendorName}: ${params.narration ?? 'N/A'}`,
      sourceType: 'bank_debit',
      sourceId: params.bankTransactionId,
      lines: [
        { accountCode: params.expenseAccountCode, debit: params.amount },
        { accountCode: params.bankGlAccountCode, credit: params.amount },
      ],
    });

    await this.db.update(bankTransactions)
      .set({
        vendorId: params.vendorId,
        glAccountId: expenseGlId,
        journalEntryId: entry.id,
        reconStatus: 'matched',
        updatedAt: new Date(),
      })
      .where(and(
        eq(bankTransactions.tenantId, this.tenantId),
        eq(bankTransactions.id, params.bankTransactionId),
      ));

    return { billId: null, paymentId: null, journalEntryId: entry.id };
  }

  /**
   * Undo whatever this service did when the wrong vendor was assigned.
   * Looks up the recon-match by bank txn, classifies it via payment.notes,
   * then rolls back the bill/advance/JEs accordingly. Safe to call when
   * nothing was created (idempotent — just clears the txn tag).
   */
  async reverseFromBankTxn(bankTransactionId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      // Path 1/2: payment-linked via reconciliation_matches
      const [match] = await tx.select().from(reconciliationMatches)
        .where(and(
          eq(reconciliationMatches.tenantId, this.tenantId),
          eq(reconciliationMatches.bankTransactionId, bankTransactionId),
        )).limit(1);

      if (match?.paymentId) {
        const [payment] = await tx.select().from(payments)
          .where(eq(payments.id, match.paymentId)).limit(1);

        const note = payment?.notes ?? '';
        if (payment && note.startsWith('Auto-created from bank transaction')) {
          const billPreexisted = note === 'Auto-created from bank transaction (matched existing bill)';
          await this.rollbackAutoPayment(tx as unknown as Db, payment.id, billPreexisted);
        }
        await tx.delete(reconciliationMatches).where(eq(reconciliationMatches.id, match.id));
      }

      // Path 3: direct expense JE — reverse the JE if it was sourced by this txn
      const [txn] = await tx.select().from(bankTransactions)
        .where(and(
          eq(bankTransactions.tenantId, this.tenantId),
          eq(bankTransactions.id, bankTransactionId),
        )).limit(1);
      if (txn?.journalEntryId) {
        await tx.update(journalEntries)
          .set({ status: 'reversed', updatedAt: new Date() })
          .where(and(
            eq(journalEntries.tenantId, this.tenantId),
            eq(journalEntries.id, txn.journalEntryId),
            eq(journalEntries.sourceType, 'bank_debit'),
            eq(journalEntries.sourceId, bankTransactionId),
          ));
      }

      await tx.update(bankTransactions).set({
        vendorId: null,
        glAccountId: null,
        journalEntryId: null,
        reconStatus: 'unreconciled',
        updatedAt: new Date(),
      }).where(and(
        eq(bankTransactions.tenantId, this.tenantId),
        eq(bankTransactions.id, bankTransactionId),
      ));
    });
  }

  private async rollbackAutoPayment(
    tx: Db,
    paymentId: string,
    billPreexisted: boolean,
  ): Promise<void> {
    const allocs = await tx.select().from(paymentAllocations)
      .where(eq(paymentAllocations.paymentId, paymentId));

    for (const alloc of allocs) {
      const [bill] = await tx.select().from(purchaseInvoices)
        .where(eq(purchaseInvoices.id, alloc.invoiceId)).limit(1);
      if (!bill) continue;

      const newPaid = Math.max(0, parseFloat(bill.amountPaid) - parseFloat(alloc.amount));
      const newBal = parseFloat(bill.balanceDue) + parseFloat(alloc.amount);
      const restoredStatus: 'approved' | 'partially_paid' = newPaid <= 0.01 ? 'approved' : 'partially_paid';

      await tx.update(purchaseInvoices).set({
        amountPaid: String(newPaid),
        balanceDue: String(newBal),
        status: billPreexisted ? restoredStatus : 'cancelled',
        updatedAt: new Date(),
      }).where(eq(purchaseInvoices.id, bill.id));

      if (!billPreexisted) {
        await tx.update(journalEntries)
          .set({ status: 'reversed', updatedAt: new Date() })
          .where(and(
            eq(journalEntries.tenantId, this.tenantId),
            eq(journalEntries.sourceType, 'purchase_invoice'),
            eq(journalEntries.sourceId, bill.id),
          ));
      }
    }

    await tx.delete(paymentAllocations).where(eq(paymentAllocations.paymentId, paymentId));
    await tx.update(payments)
      .set({ status: 'reversed', updatedAt: new Date() })
      .where(eq(payments.id, paymentId));
    await tx.update(journalEntries)
      .set({ status: 'reversed', updatedAt: new Date() })
      .where(and(
        eq(journalEntries.tenantId, this.tenantId),
        eq(journalEntries.sourceType, 'payment'),
        eq(journalEntries.sourceId, paymentId),
      ));
  }

}
