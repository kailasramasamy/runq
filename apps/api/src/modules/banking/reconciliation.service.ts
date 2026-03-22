import { eq, and, gte, lte, sql, isNull } from 'drizzle-orm';
import {
  bankTransactions,
  bankAccounts,
  reconciliationMatches,
  bankReconciliations,
  payments,
  paymentReceipts,
} from '@runq/db';
import type { Db } from '@runq/db';
import type { AutoReconciliationResult, BankReconciliation, ReconciliationMatch } from '@runq/types';
import type { AutoReconcileInput, ClosePeriodInput, ManualMatchInput } from '@runq/validators';
import { NotFoundError, ConflictError } from '../../utils/errors';
import { toNumber } from '../../utils/decimal';

type BankTxnRow = typeof bankTransactions.$inferSelect;
type PaymentRow = typeof payments.$inferSelect;
type ReceiptRow = typeof paymentReceipts.$inferSelect;

export interface UnreconciledResult {
  unreconciledBankTxns: BankTxnRow[];
  unreconciledPayments: PaymentRow[];
  unreconciledReceipts: ReceiptRow[];
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

    return {
      unreconciledBankTxns,
      unreconciledPayments,
      unreconciledReceipts,
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
    const matchedTxnIds = new Set<string>();
    const matchedPaymentIds = new Set<string>();
    const matchedReceiptIds = new Set<string>();

    await this.matchByUTR(txns, allPayments, allReceipts, matched, matchedTxnIds, matchedPaymentIds, matchedReceiptIds);
    await this.matchByAmountDate(txns, allPayments, allReceipts, matched, matchedTxnIds, matchedPaymentIds, matchedReceiptIds);

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

    const { paymentId, receiptId, matchAmount } = await this.resolveMatchTarget(input);

    const diff = Math.abs(toNumber(txn.amount) - matchAmount);
    if (diff > 1) throw new ConflictError(`Amount mismatch: bank ${txn.amount}, book ${matchAmount}`);

    return this.db.transaction(async (tx) => {
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
  }

  async unmatch(bankTransactionId: string): Promise<void> {
    const [txn] = await this.db
      .select()
      .from(bankTransactions)
      .where(and(eq(bankTransactions.id, bankTransactionId), eq(bankTransactions.tenantId, this.tenantId)))
      .limit(1);

    if (!txn) throw new NotFoundError('Bank transaction');
    if (txn.reconStatus === 'unreconciled') throw new ConflictError('Transaction is not reconciled');

    await this.db.transaction(async (tx) => {
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

  private async matchByUTR(
    txns: BankTxnRow[],
    allPayments: PaymentRow[],
    allReceipts: ReceiptRow[],
    matched: AutoReconciliationResult['matched'],
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
        await this.insertMatch(txn.id, payment.id, null, 'auto_utr');
        matchedTxnIds.add(txn.id);
        matchedPaymentIds.add(payment.id);
        matched.push({ bankTransactionId: txn.id, matchedTo: { type: 'vendor_payment', id: payment.id }, strategy: 'utr', amount: toNumber(txn.amount), confidence: 'exact' });
        continue;
      }

      const receipt = allReceipts.find(
        (r) => !matchedReceiptIds.has(r.id) && r.referenceNumber === txn.reference,
      );
      if (receipt) {
        await this.insertMatch(txn.id, null, receipt.id, 'auto_utr');
        matchedTxnIds.add(txn.id);
        matchedReceiptIds.add(receipt.id);
        matched.push({ bankTransactionId: txn.id, matchedTo: { type: 'payment_receipt', id: receipt.id }, strategy: 'utr', amount: toNumber(txn.amount), confidence: 'exact' });
      }
    }
  }

  private async matchByAmountDate(
    txns: BankTxnRow[],
    allPayments: PaymentRow[],
    allReceipts: ReceiptRow[],
    matched: AutoReconciliationResult['matched'],
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
          await this.insertMatch(txn.id, candidates[0]!.id, null, 'auto_amount_date');
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
          await this.insertMatch(txn.id, null, candidates[0]!.id, 'auto_amount_date');
          matchedTxnIds.add(txn.id);
          matchedReceiptIds.add(candidates[0]!.id);
          matched.push({ bankTransactionId: txn.id, matchedTo: { type: 'payment_receipt', id: candidates[0]!.id }, strategy: 'amount_date', amount, confidence: 'high' });
        }
      }
    }
  }

  private async insertMatch(
    bankTransactionId: string,
    paymentId: string | null,
    receiptId: string | null,
    matchType: 'auto_utr' | 'auto_amount_date' | 'manual',
  ) {
    await this.db.transaction(async (tx) => {
      await tx.insert(reconciliationMatches).values({
        tenantId: this.tenantId,
        bankTransactionId,
        paymentId,
        receiptId,
        matchType,
      });
      await tx
        .update(bankTransactions)
        .set({ reconStatus: matchType === 'manual' ? 'manually_matched' : 'matched', updatedAt: new Date() })
        .where(eq(bankTransactions.id, bankTransactionId));
    });
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
      return { paymentId: payment.id, receiptId: null as null, matchAmount: toNumber(payment.amount) };
    }

    const [receipt] = await this.db
      .select()
      .from(paymentReceipts)
      .where(and(eq(paymentReceipts.id, input.matchId), eq(paymentReceipts.tenantId, this.tenantId)))
      .limit(1);
    if (!receipt) throw new NotFoundError('Payment receipt');
    return { paymentId: null as null, receiptId: receipt.id, matchAmount: toNumber(receipt.amount) };
  }

  private toMatch(row: typeof reconciliationMatches.$inferSelect): ReconciliationMatch {
    return {
      id: row.id,
      tenantId: row.tenantId,
      bankTransactionId: row.bankTransactionId,
      paymentId: row.paymentId,
      receiptId: row.receiptId,
      matchType: row.matchType,
      matchedBy: row.matchedBy,
      matchedAt: row.matchedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    };
  }
}
