import { eq, and, gte, lte, sql, isNull, inArray, ilike, or } from 'drizzle-orm';
import {
  bankTransactions,
  bankAccounts,
  reconciliationMatches,
  bankReconciliations,
  bankMatchCorrections,
  payments,
  paymentReceipts,
  cheques,
  customers,
  vendors,
  accounts,
} from '@runq/db';
import { extractNarrationPattern } from './categorize.service';
import type { Db } from '@runq/db';
import type { AutoReconciliationResult, BankReconciliation, ReconciliationMatch } from '@runq/types';
import type { AutoReconcileInput, ClosePeriodInput, ManualMatchInput, PostAsExpenseInput } from '@runq/validators';
import { NotFoundError, ConflictError } from '../../utils/errors';
import { GLService } from '../gl/gl.service';
import { PaymentService } from '../ap/payment.service';
import { toNumber } from '../../utils/decimal';
import type { SmartMatchResult } from './smart-match.service';
import { SmartMatchService } from './smart-match.service';
import { TdsMatchService } from './tds-match.service';
import { AutoReceiptService } from './auto-receipt.service';

type BankTxnRow = typeof bankTransactions.$inferSelect;
type PaymentRow = typeof payments.$inferSelect;
type ReceiptRow = typeof paymentReceipts.$inferSelect;

interface PendingMatch {
  bankTransactionId: string;
  paymentId: string | null;
  receiptId: string | null;
  matchType: 'auto_utr' | 'auto_amount_date';
}

export interface UnreconciledResult {
  unreconciledBankTxns: BankTxnRow[];
  unreconciledPayments: PaymentRow[];
  unreconciledReceipts: ReceiptRow[];
  suggestedMatches: SmartMatchResult[];
  summary: { bankBalance: number; bookBalance: number; difference: number };
}

export class ReconciliationService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async getUnreconciled(bankAccountId: string): Promise<UnreconciledResult> {
    const [account] = await this.db
      .select()
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, bankAccountId), eq(bankAccounts.tenantId, this.tenantId)))
      .limit(1);

    if (!account) throw new NotFoundError('Bank account');

    const [unreconciledBankTxns, unreconciledPayments, unreconciledReceipts] = await Promise.all([
      this.db.select().from(bankTransactions).where(
        and(
          eq(bankTransactions.bankAccountId, bankAccountId),
          eq(bankTransactions.tenantId, this.tenantId),
          eq(bankTransactions.reconStatus, 'unreconciled'),
        ),
      ),
      this.db.select().from(payments).where(
        and(
          eq(payments.bankAccountId, bankAccountId),
          eq(payments.tenantId, this.tenantId),
          isNull(sql`(select id from reconciliation_matches where payment_id = ${payments.id} limit 1)`),
        ),
      ),
      this.db.select().from(paymentReceipts).where(
        and(
          eq(paymentReceipts.bankAccountId, bankAccountId),
          eq(paymentReceipts.tenantId, this.tenantId),
          isNull(sql`(select id from reconciliation_matches where receipt_id = ${paymentReceipts.id} limit 1)`),
        ),
      ),
    ]);

    const bankBalance = toNumber(account.currentBalance);
    const totalPayments = unreconciledPayments.reduce((s, p) => s + toNumber(p.amount), 0);
    const totalReceipts = unreconciledReceipts.reduce((s, r) => s + toNumber(r.amount), 0);
    const bookBalance = bankBalance - totalPayments + totalReceipts;

    const smartMatch = new SmartMatchService(this.db, this.tenantId);
    const tdsMatch = new TdsMatchService(this.db, this.tenantId);

    const [smartSuggestions, tdsSuggestions] = await Promise.all([
      smartMatch.getSuggestions(bankAccountId),
      tdsMatch.getSuggestions(bankAccountId),
    ]);

    const suggestedMatches = this.mergeSuggestions(smartSuggestions, tdsSuggestions);

    return {
      unreconciledBankTxns,
      unreconciledPayments,
      unreconciledReceipts,
      suggestedMatches,
      summary: { bankBalance, bookBalance, difference: bankBalance - bookBalance },
    };
  }

  async autoReconcile(bankAccountId: string, input: AutoReconcileInput): Promise<AutoReconciliationResult> {
    const txns = await this.fetchUnreconciledTxns(bankAccountId, input.dateFrom, input.dateTo);
    for (const txn of txns) {
      await this.validateNotInClosedPeriod(txn.transactionDate, bankAccountId);
    }
    const [allPayments, allReceipts] = await this.fetchBookItems(bankAccountId);

    const matched: AutoReconciliationResult['matched'] = [];
    const pendingMatches: PendingMatch[] = [];
    const matchedTxnIds = new Set<string>();
    const matchedPaymentIds = new Set<string>();
    const matchedReceiptIds = new Set<string>();

    this.matchByUTR(txns, allPayments, allReceipts, matched, pendingMatches, matchedTxnIds, matchedPaymentIds, matchedReceiptIds);
    this.matchByAmountDate(txns, allPayments, allReceipts, matched, pendingMatches, matchedTxnIds, matchedPaymentIds, matchedReceiptIds);

    // Bulk-insert all matches and bulk-update txn statuses in one transaction
    if (pendingMatches.length > 0) {
      await this.flushMatches(pendingMatches);
    }

    // Auto-receipt: for unmatched credit txns that have a customerId, try to
    // find an unpaid invoice and create a receipt + allocation automatically.
    const autoReceiptSvc = new AutoReceiptService(this.db, this.tenantId);
    const creditWithCustomer = txns.filter(
      (t) => !matchedTxnIds.has(t.id) && t.type === 'credit' && t.customerId,
    );
    if (creditWithCustomer.length > 0) {
      const bankGlCode = await this.fetchBankGlCode(bankAccountId);
      if (bankGlCode) {
        for (const txn of creditWithCustomer) {
          const [cust] = await this.db.select({ name: customers.name }).from(customers)
            .where(and(eq(customers.id, txn.customerId!), eq(customers.tenantId, this.tenantId))).limit(1);
          if (!cust) continue;
          const result = await autoReceiptSvc.createFromBankTxn({
            bankTransactionId: txn.id,
            customerId: txn.customerId!,
            customerName: cust.name,
            bankAccountId,
            bankGlAccountCode: bankGlCode,
            amount: toNumber(txn.amount),
            transactionDate: txn.transactionDate,
            narration: txn.narration,
            reference: txn.reference,
          });
          if (result !== null) {
            matchedTxnIds.add(txn.id);
            matched.push({
              bankTransactionId: txn.id,
              matchedTo: { type: 'payment_receipt', id: result.receiptId },
              strategy: 'customer_invoice',
              amount: toNumber(txn.amount),
              confidence: 'high',
            });
          }
        }
      }
    }

    // Auto-clear deposited cheques that match reconciled credit transactions
    const matchedCreditTxns = txns.filter((t) => matchedTxnIds.has(t.id) && t.type === 'credit');
    for (const txn of matchedCreditTxns) {
      await this.tryClearChequeForTxn(bankAccountId, toNumber(txn.amount), txn.transactionDate);
    }

    const unmatchedTxns = txns.filter((t) => !matchedTxnIds.has(t.id));
    const unmatchedPayments = [
      ...allPayments.filter((p) => !matchedPaymentIds.has(p.id)).map((p) => ({
        id: p.id,
        type: 'vendor_payment' as const,
        amount: toNumber(p.amount),
        date: p.paymentDate,
        referenceNumber: p.utrNumber,
      })),
      ...allReceipts.filter((r) => !matchedReceiptIds.has(r.id)).map((r) => ({
        id: r.id,
        type: 'payment_receipt' as const,
        amount: toNumber(r.amount),
        date: r.receiptDate,
        referenceNumber: r.referenceNumber,
      })),
    ];

    const totalBankTxns = txns.length;
    const autoMatched = matched.length;
    const matchRate = totalBankTxns > 0 ? `${Math.round((autoMatched / totalBankTxns) * 100)}%` : '0%';

    return {
      matched,
      unmatched: {
        bankTransactions: unmatchedTxns.map((t) => ({
          id: t.id,
          date: t.transactionDate,
          description: t.narration,
          amount: toNumber(t.amount),
          type: t.type,
        })),
        payments: unmatchedPayments,
      },
      summary: { totalBankTxns, autoMatched, remainingUnmatched: totalBankTxns - autoMatched, matchRate },
    };
  }

  async manualMatch(input: ManualMatchInput, userId: string): Promise<ReconciliationMatch> {
    const [txn] = await this.db
      .select()
      .from(bankTransactions)
      .where(and(eq(bankTransactions.id, input.bankTransactionId), eq(bankTransactions.tenantId, this.tenantId)))
      .limit(1);

    if (!txn) throw new NotFoundError('Bank transaction');
    if (txn.reconStatus !== 'unreconciled') throw new ConflictError('Transaction is already reconciled');

    await this.validateNotInClosedPeriod(txn.transactionDate, txn.bankAccountId);

    const { paymentId, receiptId, vendorId, customerId, matchAmount } = await this.resolveMatchTarget(input);

    const diff = Math.abs(toNumber(txn.amount) - matchAmount);
    if (diff > 1) throw new ConflictError(`Amount mismatch: bank ${txn.amount}, book ${matchAmount}`);

    const result = await this.db.transaction(async (tx) => {
      const [match] = await tx
        .insert(reconciliationMatches)
        .values({
          tenantId: this.tenantId,
          bankTransactionId: input.bankTransactionId,
          paymentId: paymentId ?? null,
          receiptId: receiptId ?? null,
          matchType: 'manual',
          matchedBy: userId,
        })
        .returning();

      await tx
        .update(bankTransactions)
        .set({ reconStatus: 'manually_matched', updatedAt: new Date() })
        .where(eq(bankTransactions.id, input.bankTransactionId));

      return this.toMatch(match!);
    });

    // Auto-clear deposited cheque if this is a credit transaction
    if (txn.type === 'credit') {
      await this.tryClearChequeForTxn(txn.bankAccountId, toNumber(txn.amount), txn.transactionDate);
    }

    // Close the recon feedback loop: log the user's match decision so
    // smart-match can later score future suggestions by historical hit
    // rate against this narration pattern + vendor/customer.
    await this.logMatchCorrection({
      bankTransactionId: input.bankTransactionId,
      narration: txn.narration,
      amount: toNumber(txn.amount),
      txnType: txn.type,
      paymentId,
      receiptId,
      vendorId,
      customerId,
      action: 'match',
      actedBy: userId,
    });

    return result;
  }

  /** Best-effort log; never throw. */
  private async logMatchCorrection(args: {
    bankTransactionId: string;
    narration: string | null;
    amount: number;
    txnType: 'credit' | 'debit';
    paymentId: string | null;
    receiptId: string | null;
    vendorId: string | null;
    customerId: string | null;
    action: 'match' | 'unmatch';
    actedBy?: string;
  }): Promise<void> {
    try {
      const pattern = args.narration ? extractNarrationPattern(args.narration) : null;
      await this.db.insert(bankMatchCorrections).values({
        tenantId: this.tenantId,
        bankTransactionId: args.bankTransactionId,
        narrationPattern: pattern,
        amount: String(args.amount),
        txnType: args.txnType,
        paymentId: args.paymentId,
        receiptId: args.receiptId,
        vendorId: args.vendorId,
        customerId: args.customerId,
        action: args.action,
        actedBy: args.actedBy ?? null,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[bank-match-corrections] failed to log', err);
    }
  }

  async unmatch(bankTransactionId: string, userId?: string): Promise<void> {
    const [txn] = await this.db
      .select()
      .from(bankTransactions)
      .where(and(eq(bankTransactions.id, bankTransactionId), eq(bankTransactions.tenantId, this.tenantId)))
      .limit(1);

    if (!txn) throw new NotFoundError('Bank transaction');
    if (txn.reconStatus === 'unreconciled') throw new ConflictError('Transaction is not reconciled');

    const [match] = await this.db
      .select()
      .from(reconciliationMatches)
      .where(
        and(
          eq(reconciliationMatches.bankTransactionId, bankTransactionId),
          eq(reconciliationMatches.tenantId, this.tenantId),
        ),
      )
      .limit(1);

    // Reverse linked payment (restores invoice balances + reverses GL)
    if (match?.paymentId) {
      const paymentService = new PaymentService(this.db, this.tenantId);
      await paymentService.reversePayment(match.paymentId, userId ?? 'system', 'Reversed via reconciliation unmatch');
    }

    await this.db.transaction(async (tx) => {
      // Reverse expense post JE
      if (match?.journalEntryId) {
        const { journalEntries } = await import('@runq/db');
        await tx
          .update(journalEntries)
          .set({ status: 'reversed', updatedAt: new Date() })
          .where(eq(journalEntries.id, match.journalEntryId));
      }

      await tx
        .delete(reconciliationMatches)
        .where(
          and(
            eq(reconciliationMatches.bankTransactionId, bankTransactionId),
            eq(reconciliationMatches.tenantId, this.tenantId),
          ),
        );

      await tx
        .update(bankTransactions)
        .set({ reconStatus: 'unreconciled', updatedAt: new Date() })
        .where(eq(bankTransactions.id, bankTransactionId));
    });

    // Log the unmatch as a negative signal — if the user reversed an
    // earlier match, that pattern → vendor/customer mapping was wrong.
    if (match) {
      let vendorId: string | null = null;
      let customerId: string | null = null;
      if (match.paymentId) {
        const [p] = await this.db
          .select({ vendorId: payments.vendorId })
          .from(payments)
          .where(and(eq(payments.id, match.paymentId), eq(payments.tenantId, this.tenantId)))
          .limit(1);
        vendorId = p?.vendorId ?? null;
      } else if (match.receiptId) {
        const [r] = await this.db
          .select({ customerId: paymentReceipts.customerId })
          .from(paymentReceipts)
          .where(and(eq(paymentReceipts.id, match.receiptId), eq(paymentReceipts.tenantId, this.tenantId)))
          .limit(1);
        customerId = r?.customerId ?? null;
      }
      await this.logMatchCorrection({
        bankTransactionId,
        narration: txn.narration,
        amount: toNumber(txn.amount),
        txnType: txn.type,
        paymentId: match.paymentId ?? null,
        receiptId: match.receiptId ?? null,
        vendorId,
        customerId,
        action: 'unmatch',
        actedBy: userId,
      });
    }
  }

  async postAsExpense(input: PostAsExpenseInput, userId: string): Promise<ReconciliationMatch> {
    const [txn] = await this.db
      .select()
      .from(bankTransactions)
      .where(and(eq(bankTransactions.id, input.bankTransactionId), eq(bankTransactions.tenantId, this.tenantId)))
      .limit(1);

    if (!txn) throw new NotFoundError('Bank transaction');
    if (txn.reconStatus !== 'unreconciled') throw new ConflictError('Transaction is already reconciled');
    if (txn.type !== 'debit') throw new ConflictError('Only debit transactions can be posted as expenses');

    await this.validateNotInClosedPeriod(txn.transactionDate, txn.bankAccountId);

    const bankGlCode = await this.fetchBankGlCode(txn.bankAccountId);
    if (!bankGlCode) throw new ConflictError('Bank account has no linked GL account. Link one in bank account settings.');

    const amount = toNumber(txn.amount);
    const glService = new GLService(this.db, this.tenantId);
    const je = await glService.createJournalEntry({
      date: txn.transactionDate,
      description: input.narration || `Bank expense: ${txn.narration ?? 'Direct expense'}`,
      sourceType: 'bank_expense',
      sourceId: txn.id,
      createdBy: userId,
      lines: [
        { accountCode: input.expenseAccountCode, debit: amount },
        { accountCode: bankGlCode, credit: amount },
      ],
    });

    const [match] = await this.db.transaction(async (tx) => {
      const [m] = await tx
        .insert(reconciliationMatches)
        .values({
          tenantId: this.tenantId,
          bankTransactionId: input.bankTransactionId,
          journalEntryId: je.id,
          matchType: 'expense_post',
          matchedBy: userId,
        })
        .returning();

      await tx
        .update(bankTransactions)
        .set({ reconStatus: 'manually_matched', updatedAt: new Date() })
        .where(eq(bankTransactions.id, input.bankTransactionId));

      return [m!];
    });

    return this.toMatch(match);
  }

  private async fetchUnreconciledTxns(bankAccountId: string, dateFrom?: string, dateTo?: string) {
    const conditions = [
      eq(bankTransactions.bankAccountId, bankAccountId),
      eq(bankTransactions.tenantId, this.tenantId),
      eq(bankTransactions.reconStatus, 'unreconciled'),
      dateFrom ? gte(bankTransactions.transactionDate, dateFrom) : undefined,
      dateTo ? lte(bankTransactions.transactionDate, dateTo) : undefined,
    ].filter(Boolean) as Parameters<typeof and>;

    return this.db.select().from(bankTransactions).where(and(...conditions));
  }

  private async fetchBookItems(bankAccountId: string) {
    return Promise.all([
      this.db.select().from(payments).where(
        and(eq(payments.bankAccountId, bankAccountId), eq(payments.tenantId, this.tenantId)),
      ),
      this.db.select().from(paymentReceipts).where(
        and(eq(paymentReceipts.bankAccountId, bankAccountId), eq(paymentReceipts.tenantId, this.tenantId)),
      ),
    ]);
  }

  private matchByUTR(
    txns: BankTxnRow[],
    allPayments: PaymentRow[],
    allReceipts: ReceiptRow[],
    matched: AutoReconciliationResult['matched'],
    pendingMatches: PendingMatch[],
    matchedTxnIds: Set<string>,
    matchedPaymentIds: Set<string>,
    matchedReceiptIds: Set<string>,
  ) {
    for (const txn of txns) {
      if (!txn.reference || matchedTxnIds.has(txn.id)) continue;

      const payment = allPayments.find(
        (p) => !matchedPaymentIds.has(p.id) && p.utrNumber === txn.reference,
      );
      if (payment) {
        pendingMatches.push({ bankTransactionId: txn.id, paymentId: payment.id, receiptId: null, matchType: 'auto_utr' });
        matchedTxnIds.add(txn.id);
        matchedPaymentIds.add(payment.id);
        matched.push({ bankTransactionId: txn.id, matchedTo: { type: 'vendor_payment', id: payment.id }, strategy: 'utr', amount: toNumber(txn.amount), confidence: 'exact' });
        continue;
      }

      const receipt = allReceipts.find(
        (r) => !matchedReceiptIds.has(r.id) && r.referenceNumber === txn.reference,
      );
      if (receipt) {
        pendingMatches.push({ bankTransactionId: txn.id, paymentId: null, receiptId: receipt.id, matchType: 'auto_utr' });
        matchedTxnIds.add(txn.id);
        matchedReceiptIds.add(receipt.id);
        matched.push({ bankTransactionId: txn.id, matchedTo: { type: 'payment_receipt', id: receipt.id }, strategy: 'utr', amount: toNumber(txn.amount), confidence: 'exact' });
      }
    }
  }

  private matchByAmountDate(
    txns: BankTxnRow[],
    allPayments: PaymentRow[],
    allReceipts: ReceiptRow[],
    matched: AutoReconciliationResult['matched'],
    pendingMatches: PendingMatch[],
    matchedTxnIds: Set<string>,
    matchedPaymentIds: Set<string>,
    matchedReceiptIds: Set<string>,
  ) {
    for (const txn of txns) {
      if (matchedTxnIds.has(txn.id)) continue;

      const amount = toNumber(txn.amount);
      const txnDate = new Date(txn.transactionDate).getTime();

      if (txn.type === 'debit') {
        const candidates = allPayments.filter((p) => {
          if (matchedPaymentIds.has(p.id)) return false;
          const diff = Math.abs(toNumber(p.amount) - amount);
          const dayDiff = Math.abs(new Date(p.paymentDate).getTime() - txnDate) / 86400000;
          return diff < 0.01 && dayDiff <= 1;
        });
        if (candidates.length === 1) {
          pendingMatches.push({ bankTransactionId: txn.id, paymentId: candidates[0]!.id, receiptId: null, matchType: 'auto_amount_date' });
          matchedTxnIds.add(txn.id);
          matchedPaymentIds.add(candidates[0]!.id);
          matched.push({ bankTransactionId: txn.id, matchedTo: { type: 'vendor_payment', id: candidates[0]!.id }, strategy: 'amount_date', amount, confidence: 'high' });
        }
      } else {
        const candidates = allReceipts.filter((r) => {
          if (matchedReceiptIds.has(r.id)) return false;
          const diff = Math.abs(toNumber(r.amount) - amount);
          const dayDiff = Math.abs(new Date(r.receiptDate).getTime() - txnDate) / 86400000;
          return diff < 0.01 && dayDiff <= 1;
        });
        if (candidates.length === 1) {
          pendingMatches.push({ bankTransactionId: txn.id, paymentId: null, receiptId: candidates[0]!.id, matchType: 'auto_amount_date' });
          matchedTxnIds.add(txn.id);
          matchedReceiptIds.add(candidates[0]!.id);
          matched.push({ bankTransactionId: txn.id, matchedTo: { type: 'payment_receipt', id: candidates[0]!.id }, strategy: 'amount_date', amount, confidence: 'high' });
        }
      }
    }
  }

  /**
   * Bulk-insert all pending reconciliation matches and update transaction statuses
   * in a single database transaction — eliminates N+1 writes from the match loops.
   */
  private async flushMatches(pendingMatches: PendingMatch[]): Promise<void> {
    const now = new Date();
    await this.db.transaction(async (tx) => {
      await tx.insert(reconciliationMatches).values(
        pendingMatches.map((m) => ({
          tenantId: this.tenantId,
          bankTransactionId: m.bankTransactionId,
          paymentId: m.paymentId,
          receiptId: m.receiptId,
          matchType: m.matchType,
        })),
      );

      await tx
        .update(bankTransactions)
        .set({ reconStatus: 'matched', updatedAt: now })
        .where(inArray(bankTransactions.id, pendingMatches.map((m) => m.bankTransactionId)));
    });
  }

  async getMatchedTransactions(bankAccountId: string, page = 1, limit = 20, search?: string) {
    const offset = (page - 1) * limit;

    const baseQuery = this.db
      .select({
        matchId: reconciliationMatches.id,
        matchType: reconciliationMatches.matchType,
        matchedAt: reconciliationMatches.matchedAt,
        bankTxnId: bankTransactions.id,
        txnDate: bankTransactions.transactionDate,
        txnNarration: bankTransactions.narration,
        txnAmount: bankTransactions.amount,
        txnType: bankTransactions.type,
        txnReference: bankTransactions.reference,
        vendorName: vendors.name,
        customerName: customers.name,
      })
      .from(reconciliationMatches)
      .innerJoin(bankTransactions, eq(reconciliationMatches.bankTransactionId, bankTransactions.id))
      .leftJoin(payments, eq(reconciliationMatches.paymentId, payments.id))
      .leftJoin(vendors, eq(payments.vendorId, vendors.id))
      .leftJoin(paymentReceipts, eq(reconciliationMatches.receiptId, paymentReceipts.id))
      .leftJoin(customers, eq(paymentReceipts.customerId, customers.id));

    const conditions = [
      eq(reconciliationMatches.tenantId, this.tenantId),
      eq(bankTransactions.bankAccountId, bankAccountId),
    ];

    if (search) {
      const pattern = `%${search}%`;
      conditions.push(
        or(
          ilike(bankTransactions.narration, pattern),
          ilike(bankTransactions.reference, pattern),
          ilike(vendors.name, pattern),
          ilike(customers.name, pattern),
        )!,
      );
    }

    const fullWhere = and(...conditions);

    const countQuery = this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(reconciliationMatches)
      .innerJoin(bankTransactions, eq(reconciliationMatches.bankTransactionId, bankTransactions.id))
      .leftJoin(payments, eq(reconciliationMatches.paymentId, payments.id))
      .leftJoin(vendors, eq(payments.vendorId, vendors.id))
      .leftJoin(paymentReceipts, eq(reconciliationMatches.receiptId, paymentReceipts.id))
      .leftJoin(customers, eq(paymentReceipts.customerId, customers.id));

    const [rows, countResult] = await Promise.all([
      baseQuery.where(fullWhere).orderBy(sql`${reconciliationMatches.matchedAt} desc`).limit(limit).offset(offset),
      countQuery.where(fullWhere),
    ]);

    const total = countResult[0]?.count ?? 0;
    return {
      data: rows.map((r) => ({
        matchId: r.matchId,
        matchType: r.matchType,
        matchedAt: r.matchedAt.toISOString(),
        bankTransactionId: r.bankTxnId,
        date: r.txnDate,
        narration: r.txnNarration,
        amount: toNumber(r.txnAmount),
        type: r.txnType,
        reference: r.txnReference,
        partyName: r.vendorName ?? r.customerName ?? null,
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async closePeriod(input: ClosePeriodInput, completedBy: string): Promise<BankReconciliation> {
    const [account] = await this.db
      .select()
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, input.bankAccountId), eq(bankAccounts.tenantId, this.tenantId)))
      .limit(1);

    if (!account) throw new NotFoundError('Bank account');

    const bookBalance = toNumber(account.currentBalance);
    const difference = input.bankClosingBalance - bookBalance;

    const [row] = await this.db
      .insert(bankReconciliations)
      .values({
        tenantId: this.tenantId,
        bankAccountId: input.bankAccountId,
        periodStart: account.createdAt.toISOString().split('T')[0]!,
        periodEnd: input.periodEnd,
        bankClosingBalance: String(input.bankClosingBalance),
        bookClosingBalance: String(bookBalance),
        difference: String(difference),
        isCompleted: true,
        completedAt: new Date(),
        completedBy,
      })
      .returning();

    return this.toReconciliation(row!);
  }

  async getClosedPeriods(bankAccountId: string): Promise<BankReconciliation[]> {
    const rows = await this.db
      .select()
      .from(bankReconciliations)
      .where(
        and(
          eq(bankReconciliations.tenantId, this.tenantId),
          eq(bankReconciliations.bankAccountId, bankAccountId),
          eq(bankReconciliations.isCompleted, true),
        ),
      );

    return rows.map((r) => this.toReconciliation(r));
  }

  private async validateNotInClosedPeriod(transactionDate: string, bankAccountId: string): Promise<void> {
    const [closed] = await this.db
      .select()
      .from(bankReconciliations)
      .where(
        and(
          eq(bankReconciliations.tenantId, this.tenantId),
          eq(bankReconciliations.bankAccountId, bankAccountId),
          eq(bankReconciliations.isCompleted, true),
          lte(bankReconciliations.periodStart, transactionDate),
          gte(bankReconciliations.periodEnd, transactionDate),
        ),
      )
      .limit(1);

    if (closed) {
      throw new ConflictError(
        `Transaction date falls within closed reconciliation period (${closed.periodStart} to ${closed.periodEnd})`,
      );
    }
  }

  private toReconciliation(row: typeof bankReconciliations.$inferSelect): BankReconciliation {
    return {
      id: row.id,
      tenantId: row.tenantId,
      bankAccountId: row.bankAccountId,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      bankClosingBalance: toNumber(row.bankClosingBalance),
      bookClosingBalance: toNumber(row.bookClosingBalance),
      difference: toNumber(row.difference),
      isCompleted: row.isCompleted,
      completedAt: row.completedAt?.toISOString() ?? null,
      completedBy: row.completedBy ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async resolveMatchTarget(input: ManualMatchInput) {
    if (input.matchType === 'vendor_payment') {
      const [payment] = await this.db
        .select()
        .from(payments)
        .where(and(eq(payments.id, input.matchId), eq(payments.tenantId, this.tenantId)))
        .limit(1);
      if (!payment) throw new NotFoundError('Payment');
      return {
        paymentId: payment.id,
        receiptId: null as null,
        vendorId: payment.vendorId,
        customerId: null as null,
        matchAmount: toNumber(payment.amount),
      };
    }

    const [receipt] = await this.db
      .select()
      .from(paymentReceipts)
      .where(and(eq(paymentReceipts.id, input.matchId), eq(paymentReceipts.tenantId, this.tenantId)))
      .limit(1);
    if (!receipt) throw new NotFoundError('Payment receipt');
    return {
      paymentId: null as null,
      receiptId: receipt.id,
      vendorId: null as null,
      customerId: receipt.customerId ?? null,
      matchAmount: toNumber(receipt.amount),
    };
  }

  private mergeSuggestions(smart: SmartMatchResult[], tds: SmartMatchResult[]): SmartMatchResult[] {
    const map = new Map<string, SmartMatchResult>();

    for (const s of smart) {
      map.set(s.transactionId, s);
    }

    for (const t of tds) {
      const existing = map.get(t.transactionId);
      if (existing) {
        existing.suggestions.push(...t.suggestions);
        existing.suggestions.sort((a, b) => b.confidence - a.confidence);
      } else {
        map.set(t.transactionId, t);
      }
    }

    return Array.from(map.values());
  }

  private toMatch(row: typeof reconciliationMatches.$inferSelect): ReconciliationMatch {
    return {
      id: row.id,
      tenantId: row.tenantId,
      bankTransactionId: row.bankTransactionId,
      paymentId: row.paymentId,
      receiptId: row.receiptId,
      journalEntryId: row.journalEntryId ?? null,
      matchType: row.matchType,
      matchedBy: row.matchedBy,
      matchedAt: row.matchedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    };
  }

  /**
   * Try to auto-clear a deposited cheque that matches a bank credit transaction
   * by amount (within ₹1) and date (cheque date to cheque date + 30 days).
   */
  private async fetchBankGlCode(bankAccountId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ code: accounts.code })
      .from(bankAccounts)
      .innerJoin(accounts, eq(bankAccounts.glAccountId, accounts.id))
      .where(and(eq(bankAccounts.id, bankAccountId), eq(bankAccounts.tenantId, this.tenantId)))
      .limit(1);
    return row?.code ?? null;
  }

  private async tryClearChequeForTxn(bankAccountId: string, amount: number, txnDate: string): Promise<void> {
    const [cheque] = await this.db
      .select({ id: cheques.id })
      .from(cheques)
      .where(
        and(
          eq(cheques.tenantId, this.tenantId),
          eq(cheques.bankAccountId, bankAccountId),
          eq(cheques.status, 'deposited'),
          sql`ABS(${cheques.amount}::numeric - ${amount}) < 1`,
          lte(cheques.chequeDate, txnDate),
          gte(
            sql`${cheques.chequeDate}::date + interval '30 days'`,
            sql`${txnDate}::date`,
          ),
        ),
      )
      .limit(1);

    if (cheque) {
      await this.db
        .update(cheques)
        .set({ status: 'cleared', updatedAt: new Date() })
        .where(eq(cheques.id, cheque.id));
    }
  }
}
