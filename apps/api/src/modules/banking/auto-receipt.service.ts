import { eq, and, sql } from 'drizzle-orm';
import {
  bankTransactions,
  salesInvoices,
  paymentReceipts,
  receiptAllocations,
  reconciliationMatches,
  accounts,
  journalEntries,
} from '@runq/db';
import type { Db } from '@runq/db';
import { GLService } from '../gl/gl.service';
import { AuditService } from '../../utils/audit';

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
  skippedDrafts: { invoiceId: string; invoiceNumber: string; invoiceDate: string; totalAmount: string }[];
}

// Narration tokens that mark a credit as a non-invoice advance (transport
// advance, security deposit, loan repayment) rather than an invoice payment.
const ON_ACCOUNT_NARRATION_KEYWORDS = [
  'advance', 'truck', 'transport', 'freight', 'cartage',
  'deposit', 'loan', 'security', 'margin',
];

/**
 * Heuristic: does this credit's narration look like a non-invoice advance
 * rather than payment against invoices? The bias is intentional — a false
 * positive lands the cash on-account (safe, reversible by allocating later);
 * a false negative would FIFO non-invoice cash onto invoices, which is the
 * exact mis-allocation this guard exists to prevent.
 */
export function looksLikeOnAccountCredit(narration: string | null): boolean {
  if (!narration) return false;
  const n = narration.toLowerCase();
  return ON_ACCOUNT_NARRATION_KEYWORDS.some((kw) => n.includes(kw));
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
  /** Resolve the Accounts Receivable control account (code 1103). */
  private async findArGlId(): Promise<string | null> {
    const [arGl] = await this.db.select({ id: accounts.id }).from(accounts)
      .where(and(eq(accounts.tenantId, this.tenantId), eq(accounts.code, '1103'))).limit(1);
    return arGl?.id ?? null;
  }

  /**
   * Public entry for the manual "Receive on account (advance)" reconcile action.
   * Creates an unallocated advance receipt for the credit and links the bank txn.
   */
  async receiveOnAccount(params: AutoReceiptParams): Promise<AutoReceiptResult> {
    return this.createOnAccountReceipt(params, await this.findArGlId());
  }

  async createFromBankTxn(params: AutoReceiptParams): Promise<AutoReceiptResult | null> {
    const arGlId = await this.findArGlId();

    // 1. Existing receipt? Just link bank txn to it
    const existingReceipt = await this.findExistingReceipt(params);
    if (existingReceipt) {
      await this.linkToExistingReceipt(params.bankTransactionId, existingReceipt, params.customerId, arGlId);
      return null;
    }

    // 1b. Non-invoice credit (transport advance, deposit, loan)? Receive it
    //     on-account instead of FIFO-allocating it onto invoices it wasn't for.
    if (looksLikeOnAccountCredit(params.narration)) {
      return this.createOnAccountReceipt(params, arGlId);
    }

    // 2. Fetch all unpaid invoices for this customer (oldest first)
    const invoices = await this.findUnpaidInvoices(params.customerId);
    if (invoices.length > 0) {
      const skippedDrafts = await this.findSkippedDrafts(params.customerId, params.transactionDate);
      return this.createReceiptWithAllocations(params, invoices, arGlId, skippedDrafts);
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
   * Drafts dated on or before the receipt date are silently skipped by the
   * waterfall (status filter). They get reported back so the caller can warn
   * the user — otherwise newer sent invoices get cleared while older drafts
   * stay open, breaking sequential reconciliation.
   */
  private async findSkippedDrafts(
    customerId: string,
    receiptDate: string,
  ): Promise<AutoReceiptResult['skippedDrafts']> {
    return this.db
      .select({
        invoiceId: salesInvoices.id,
        invoiceNumber: salesInvoices.invoiceNumber,
        invoiceDate: salesInvoices.invoiceDate,
        totalAmount: salesInvoices.totalAmount,
      })
      .from(salesInvoices)
      .where(and(
        eq(salesInvoices.tenantId, this.tenantId),
        eq(salesInvoices.customerId, customerId),
        eq(salesInvoices.status, 'draft'),
        sql`${salesInvoices.invoiceDate} <= ${receiptDate}::date`,
      ))
      .orderBy(salesInvoices.invoiceDate);
  }

  /**
   * Create an on-account (advance) receipt: posts Dr Bank / Cr AR for the full
   * amount and links the bank txn, but inserts NO allocations. The cash sits as
   * a customer credit until an invoice is raised and it's allocated manually.
   */
  private async createOnAccountReceipt(
    params: AutoReceiptParams,
    arGlId: string | null,
  ): Promise<AutoReceiptResult> {
    const gl = new GLService(this.db, this.tenantId);

    const receiptId = await this.db.transaction(async (tx) => {
      const [receipt] = await tx.insert(paymentReceipts).values({
        tenantId: this.tenantId,
        customerId: params.customerId,
        bankAccountId: params.bankAccountId,
        receiptDate: params.transactionDate,
        amount: String(params.amount),
        paymentMethod: 'bank_transfer',
        referenceNumber: params.reference,
        isOnAccount: true,
        notes: `Auto-created on-account (advance) from bank transaction — "${params.narration ?? ''}"`.slice(0, 500),
      }).returning();

      await tx.insert(reconciliationMatches).values({
        tenantId: this.tenantId,
        bankTransactionId: params.bankTransactionId,
        receiptId: receipt!.id,
        matchType: 'auto_amount_date',
      });

      await tx.update(bankTransactions)
        .set({ customerId: params.customerId, glAccountId: arGlId, reconStatus: 'matched', updatedAt: new Date() })
        .where(eq(bankTransactions.id, params.bankTransactionId));

      return receipt!.id;
    });

    await gl.postReceipt({
      amount: params.amount,
      date: params.transactionDate,
      id: receiptId,
      customerName: params.customerName,
    });

    await new AuditService(this.db, this.tenantId).log({
      action: 'auto_created_on_account_from_bank_txn',
      entityType: 'payment_receipt',
      entityId: receiptId,
      metadata: { bankTransactionId: params.bankTransactionId, customerId: params.customerId, amount: params.amount, narration: params.narration },
    });

    return { receiptId, allocations: [], unallocated: params.amount, skippedDrafts: [] };
  }

  /**
   * Waterfall allocation: walk invoices oldest-first, fully pay each until
   * the receipt amount runs out. The last touched invoice may be partially paid.
   */
  private async createReceiptWithAllocations(
    params: AutoReceiptParams,
    invoices: { id: string; balanceDue: string }[],
    arGlId: string | null,
    skippedDrafts: AutoReceiptResult['skippedDrafts'],
  ): Promise<AutoReceiptResult> {
    const gl = new GLService(this.db, this.tenantId);

    const draftWarning = skippedDrafts.length > 0
      ? ` · ${skippedDrafts.length} older draft${skippedDrafts.length === 1 ? '' : 's'} skipped (#${skippedDrafts.map((d) => d.invoiceNumber).join(', #')})`
      : '';

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
        notes: `Auto-created from bank transaction${draftWarning}`,
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

      return { receiptId, allocations, unallocated: Math.round(remaining * 100) / 100, skippedDrafts };
    });

    // Post receipt JE for the full amount
    await gl.postReceipt({
      amount: params.amount,
      date: params.transactionDate,
      id: result.receiptId,
      customerName: params.customerName,
    });

    await new AuditService(this.db, this.tenantId).log({
      action: 'auto_created_from_bank_txn',
      entityType: 'payment_receipt',
      entityId: result.receiptId,
      metadata: {
        bankTransactionId: params.bankTransactionId,
        customerId: params.customerId,
        amount: params.amount,
        allocations: result.allocations,
        unallocated: result.unallocated,
        skippedDrafts: result.skippedDrafts,
      },
    });

    return result;
  }

  /**
   * Undo whatever this service did when the wrong customer was assigned.
   * Auto-created receipts have no status column, so they're hard-deleted along
   * with their allocations. Pre-existing receipts (linked via recon match only)
   * are preserved — only the recon match is removed.
   */
  async reverseFromBankTxn(bankTransactionId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [match] = await tx.select().from(reconciliationMatches)
        .where(and(
          eq(reconciliationMatches.tenantId, this.tenantId),
          eq(reconciliationMatches.bankTransactionId, bankTransactionId),
        )).limit(1);

      if (match?.receiptId) {
        const [receipt] = await tx.select().from(paymentReceipts)
          .where(eq(paymentReceipts.id, match.receiptId)).limit(1);
        const isAutoCreated = (receipt?.notes ?? '').startsWith('Auto-created from bank transaction');

        if (receipt && isAutoCreated) {
          const allocs = await tx.select().from(receiptAllocations)
            .where(eq(receiptAllocations.receiptId, receipt.id));

          for (const alloc of allocs) {
            const [inv] = await tx.select().from(salesInvoices)
              .where(eq(salesInvoices.id, alloc.invoiceId)).limit(1);
            if (!inv) continue;
            const newRecv = Math.max(0, parseFloat(inv.amountReceived) - parseFloat(alloc.amount));
            const newBal = parseFloat(inv.balanceDue) + parseFloat(alloc.amount);
            await tx.update(salesInvoices).set({
              amountReceived: String(newRecv),
              balanceDue: String(newBal),
              status: newRecv <= 0.01 ? 'sent' : 'partially_paid',
              updatedAt: new Date(),
            }).where(eq(salesInvoices.id, inv.id));
          }

          await tx.delete(receiptAllocations).where(eq(receiptAllocations.receiptId, receipt.id));
          await tx.update(journalEntries)
            .set({ status: 'reversed', updatedAt: new Date() })
            .where(and(
              eq(journalEntries.tenantId, this.tenantId),
              eq(journalEntries.sourceType, 'receipt'),
              eq(journalEntries.sourceId, receipt.id),
            ));
          // Delete the recon match BEFORE the receipt — recon_matches.receipt_id
          // FKs the receipt with default RESTRICT, so deleting the receipt
          // first throws a constraint violation.
          await tx.delete(reconciliationMatches).where(eq(reconciliationMatches.id, match.id));
          await tx.delete(paymentReceipts).where(eq(paymentReceipts.id, receipt.id));
        } else {
          await tx.delete(reconciliationMatches).where(eq(reconciliationMatches.id, match.id));
        }
      }

      await tx.update(bankTransactions).set({
        customerId: null,
        glAccountId: null,
        reconStatus: 'unreconciled',
        updatedAt: new Date(),
      }).where(and(
        eq(bankTransactions.tenantId, this.tenantId),
        eq(bankTransactions.id, bankTransactionId),
      ));
    });
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

      // If the existing receipt is on-account (no allocations yet), run FIFO
      // waterfall now so the BB Daily case — one NEFT covering several small
      // invoices — leaves the customer's ledger clean. GL was already posted
      // when the receipt was created; allocations only attribute it.
      const [existingAlloc] = await tx.select({ id: receiptAllocations.id })
        .from(receiptAllocations)
        .where(and(
          eq(receiptAllocations.tenantId, this.tenantId),
          eq(receiptAllocations.receiptId, receiptId),
        )).limit(1);
      if (existingAlloc) return;

      const [rec] = await tx.select({ amount: paymentReceipts.amount })
        .from(paymentReceipts)
        .where(eq(paymentReceipts.id, receiptId)).limit(1);
      if (!rec) return;

      const openInvoices = await tx
        .select({ id: salesInvoices.id, balanceDue: salesInvoices.balanceDue })
        .from(salesInvoices)
        .where(and(
          eq(salesInvoices.tenantId, this.tenantId),
          eq(salesInvoices.customerId, customerId),
          sql`${salesInvoices.balanceDue}::numeric > 0`,
          sql`${salesInvoices.status} NOT IN ('cancelled', 'draft')`,
        ))
        .orderBy(salesInvoices.invoiceDate);

      let remaining = parseFloat(rec.amount);
      for (const inv of openInvoices) {
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

        remaining -= allocAmount;
      }
    });
  }
}
