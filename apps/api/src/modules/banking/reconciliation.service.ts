import { eq, and, gte, lte, sql, isNull } from 'drizzle-orm';
import {
  bankTransactions,
  bankAccounts,
  reconciliationMatches,
  payments,
  paymentReceipts,
} from '@runq/db';
import type { Db } from '@runq/db';
import type { AutoReconciliationResult, ReconciliationMatch } from '@runq/types';
import type { AutoReconcileInput, ManualMatchInput } from '@runq/validators';
import { NotFoundError, ConflictError } from '../../utils/errors';

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

    const bankBalance = parseFloat(account.currentBalance);
    const totalPayments = unreconciledPayments.reduce((s, p) => s + parseFloat(p.amount), 0);
    const totalReceipts = unreconciledReceipts.reduce((s, r) => s + parseFloat(r.amount), 0);
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
        amount: parseFloat(p.amount),
        date: p.paymentDate,
        referenceNumber: p.utrNumber,
      })),
      ...allReceipts.filter((r) => !matchedReceiptIds.has(r.id)).map((r) => ({
        id: r.id,
        type: 'payment_receipt' as const,
        amount: parseFloat(r.amount),
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
          amount: parseFloat(t.amount),
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

    const { paymentId, receiptId, matchAmount } = await this.resolveMatchTarget(input);

    const diff = Math.abs(parseFloat(txn.amount) - matchAmount);
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
        matched.push({ bankTransactionId: txn.id, matchedTo: { type: 'vendor_payment', id: payment.id }, strategy: 'utr', amount: parseFloat(txn.amount), confidence: 'exact' });
        continue;
      }

      const receipt = allReceipts.find(
        (r) => !matchedReceiptIds.has(r.id) && r.referenceNumber === txn.reference,
      );
      if (receipt) {
        await this.insertMatch(txn.id, null, receipt.id, 'auto_utr');
        matchedTxnIds.add(txn.id);
        matchedReceiptIds.add(receipt.id);
        matched.push({ bankTransactionId: txn.id, matchedTo: { type: 'payment_receipt', id: receipt.id }, strategy: 'utr', amount: parseFloat(txn.amount), confidence: 'exact' });
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

      const amount = parseFloat(txn.amount);
      const txnDate = new Date(txn.transactionDate).getTime();

      if (txn.type === 'debit') {
        const candidates = allPayments.filter((p) => {
          if (matchedPaymentIds.has(p.id)) return false;
          const diff = Math.abs(parseFloat(p.amount) - amount);
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
          const diff = Math.abs(parseFloat(r.amount) - amount);
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

  private async resolveMatchTarget(input: ManualMatchInput) {
    if (input.matchType === 'vendor_payment') {
      const [payment] = await this.db
        .select()
        .from(payments)
        .where(and(eq(payments.id, input.matchId), eq(payments.tenantId, this.tenantId)))
        .limit(1);
      if (!payment) throw new NotFoundError('Payment');
      return { paymentId: payment.id, receiptId: null as null, matchAmount: parseFloat(payment.amount) };
    }

    const [receipt] = await this.db
      .select()
      .from(paymentReceipts)
      .where(and(eq(paymentReceipts.id, input.matchId), eq(paymentReceipts.tenantId, this.tenantId)))
      .limit(1);
    if (!receipt) throw new NotFoundError('Payment receipt');
    return { paymentId: null as null, receiptId: receipt.id, matchAmount: parseFloat(receipt.amount) };
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
