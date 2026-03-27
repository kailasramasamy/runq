import { eq, and, isNull, sql } from 'drizzle-orm';
import { bankTransactions, paymentReceipts, customers } from '@runq/db';
import type { Db } from '@runq/db';
import { toNumber } from '../../utils/decimal';
import type { SmartMatchResult } from './smart-match.service';

const TDS_RATES = [0.01, 0.02, 0.05, 0.10] as const;
const TDS_TOLERANCE = 1; // ₹1

interface NamedReceipt {
  id: string;
  amount: number;
  date: string;
  referenceNumber: string | null;
  customerName: string;
  customerId: string;
}

export interface TdsMatchSuggestion {
  receiptId: string;
  originalAmount: number;
  tdsRate: number;
  tdsAmount: number;
  netAmount: number;
  confidence: number;
  matchReason: string;
}

export class TdsMatchService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async getSuggestions(bankAccountId: string): Promise<SmartMatchResult[]> {
    const [creditTxns, receipts] = await Promise.all([
      this.fetchUnreconciledCredits(bankAccountId),
      this.fetchUnreconciledReceipts(bankAccountId),
    ]);

    const results: SmartMatchResult[] = [];

    for (const txn of creditTxns) {
      const suggestions = this.findTdsMatches(txn, receipts);
      if (suggestions.length > 0) {
        results.push({
          transactionId: txn.id,
          suggestions: suggestions.map((s) => ({
            receiptId: s.receiptId,
            confidence: s.confidence,
            matchReason: s.matchReason,
          })),
        });
      }
    }

    return results;
  }

  private findTdsMatches(
    txn: { id: string; amount: string },
    receipts: NamedReceipt[],
  ): TdsMatchSuggestion[] {
    const bankAmount = toNumber(txn.amount);
    const matches: TdsMatchSuggestion[] = [];

    for (const receipt of receipts) {
      const match = this.checkTdsRates(bankAmount, receipt);
      if (match) matches.push(match);
    }

    matches.sort((a, b) => b.confidence - a.confidence);
    return matches.slice(0, 3);
  }

  private checkTdsRates(bankAmount: number, receipt: NamedReceipt): TdsMatchSuggestion | null {
    for (const rate of TDS_RATES) {
      const netAmount = receipt.amount * (1 - rate);
      const diff = Math.abs(bankAmount - netAmount);

      if (diff <= TDS_TOLERANCE) {
        const tdsAmount = receipt.amount * rate;
        const pct = (rate * 100).toFixed(0);
        return {
          receiptId: receipt.id,
          originalAmount: receipt.amount,
          tdsRate: rate,
          tdsAmount: Math.round(tdsAmount * 100) / 100,
          netAmount: Math.round(netAmount * 100) / 100,
          confidence: 0.85,
          matchReason: `TDS deduction @${pct}% (₹${tdsAmount.toFixed(2)} deducted from ₹${receipt.amount.toFixed(2)})`,
        };
      }
    }
    return null;
  }

  private async fetchUnreconciledCredits(bankAccountId: string) {
    return this.db.select().from(bankTransactions).where(
      and(
        eq(bankTransactions.bankAccountId, bankAccountId),
        eq(bankTransactions.tenantId, this.tenantId),
        eq(bankTransactions.reconStatus, 'unreconciled'),
        eq(bankTransactions.type, 'credit'),
      ),
    );
  }

  private async fetchUnreconciledReceipts(bankAccountId: string): Promise<NamedReceipt[]> {
    const rows = await this.db
      .select({ receipt: paymentReceipts, customerName: customers.name })
      .from(paymentReceipts)
      .innerJoin(customers, eq(paymentReceipts.customerId, customers.id))
      .where(
        and(
          eq(paymentReceipts.bankAccountId, bankAccountId),
          eq(paymentReceipts.tenantId, this.tenantId),
          isNull(sql`(select id from reconciliation_matches where receipt_id = ${paymentReceipts.id} limit 1)`),
        ),
      );

    return rows.map((r) => ({
      id: r.receipt.id,
      amount: toNumber(r.receipt.amount),
      date: r.receipt.receiptDate,
      referenceNumber: r.receipt.referenceNumber,
      customerName: r.customerName,
      customerId: r.receipt.customerId,
    }));
  }
}
