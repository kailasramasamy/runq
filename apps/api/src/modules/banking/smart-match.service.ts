import { eq, and, isNull, sql } from 'drizzle-orm';
import {
  bankTransactions,
  payments,
  paymentReceipts,
  vendors,
  customers,
} from '@runq/db';
import type { Db } from '@runq/db';
import { toNumber } from '../../utils/decimal';

interface Suggestion {
  paymentId?: string;
  receiptId?: string;
  confidence: number;
  matchReason: string;
}

export interface SmartMatchResult {
  transactionId: string;
  suggestions: Suggestion[];
}

interface NamedPayment {
  id: string;
  amount: number;
  date: string;
  utrNumber: string | null;
  vendorName: string;
}

interface NamedReceipt {
  id: string;
  amount: number;
  date: string;
  referenceNumber: string | null;
  customerName: string;
}

export class SmartMatchService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async getSuggestions(bankAccountId: string): Promise<SmartMatchResult[]> {
    const [txns, namedPayments, namedReceipts] = await Promise.all([
      this.fetchUnreconciledTxns(bankAccountId),
      this.fetchUnreconciledPayments(bankAccountId),
      this.fetchUnreconciledReceipts(bankAccountId),
    ]);

    return txns.map((txn) => {
      const suggestions = this.scoreMatches(txn, namedPayments, namedReceipts);
      return { transactionId: txn.id, suggestions };
    });
  }

  private async fetchUnreconciledTxns(bankAccountId: string) {
    return this.db.select().from(bankTransactions).where(
      and(
        eq(bankTransactions.bankAccountId, bankAccountId),
        eq(bankTransactions.tenantId, this.tenantId),
        eq(bankTransactions.reconStatus, 'unreconciled'),
      ),
    );
  }

  private async fetchUnreconciledPayments(bankAccountId: string): Promise<NamedPayment[]> {
    const rows = await this.db
      .select({ payment: payments, vendorName: vendors.name })
      .from(payments)
      .innerJoin(vendors, eq(payments.vendorId, vendors.id))
      .where(
        and(
          eq(payments.bankAccountId, bankAccountId),
          eq(payments.tenantId, this.tenantId),
          isNull(sql`(select id from reconciliation_matches where payment_id = ${payments.id} limit 1)`),
        ),
      );

    return rows.map((r) => ({
      id: r.payment.id,
      amount: toNumber(r.payment.amount),
      date: r.payment.paymentDate,
      utrNumber: r.payment.utrNumber,
      vendorName: r.vendorName,
    }));
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
    }));
  }

  private scoreMatches(
    txn: typeof bankTransactions.$inferSelect,
    allPayments: NamedPayment[],
    allReceipts: NamedReceipt[],
  ): Suggestion[] {
    const suggestions: Suggestion[] = [];
    const txnAmount = toNumber(txn.amount);
    const txnDate = new Date(txn.transactionDate).getTime();
    const narration = txn.narration ?? '';

    if (txn.type === 'debit') {
      for (const p of allPayments) {
        const s = this.scorePayment(txn.reference, narration, txnAmount, txnDate, p);
        if (s) suggestions.push(s);
      }
    } else {
      for (const r of allReceipts) {
        const s = this.scoreReceipt(txn.reference, narration, txnAmount, txnDate, r);
        if (s) suggestions.push(s);
      }
    }

    suggestions.sort((a, b) => b.confidence - a.confidence);
    return suggestions.slice(0, 5);
  }

  private scorePayment(
    reference: string | null,
    narration: string,
    txnAmount: number,
    txnDate: number,
    p: NamedPayment,
  ): Suggestion | null {
    if (reference && p.utrNumber && reference === p.utrNumber) {
      return { paymentId: p.id, confidence: 1.0, matchReason: `UTR match: ${reference}` };
    }

    const amountMatch = Math.abs(txnAmount - p.amount) < 0.01;
    const dayDiff = Math.abs(new Date(p.date).getTime() - txnDate) / 86400000;

    if (amountMatch && dayDiff <= 1) {
      return { paymentId: p.id, confidence: 0.9, matchReason: 'Amount and date match' };
    }

    const nameInNarration = this.narrationContainsName(narration, p.vendorName);
    if (nameInNarration && amountMatch) {
      return { paymentId: p.id, confidence: 0.7, matchReason: `Narration contains "${p.vendorName}" + amount match` };
    }
    if (nameInNarration) {
      return { paymentId: p.id, confidence: 0.5, matchReason: `Narration contains "${p.vendorName}"` };
    }

    return null;
  }

  private scoreReceipt(
    reference: string | null,
    narration: string,
    txnAmount: number,
    txnDate: number,
    r: NamedReceipt,
  ): Suggestion | null {
    if (reference && r.referenceNumber && reference === r.referenceNumber) {
      return { receiptId: r.id, confidence: 1.0, matchReason: `Reference match: ${reference}` };
    }

    const amountMatch = Math.abs(txnAmount - r.amount) < 0.01;
    const dayDiff = Math.abs(new Date(r.date).getTime() - txnDate) / 86400000;

    if (amountMatch && dayDiff <= 1) {
      return { receiptId: r.id, confidence: 0.9, matchReason: 'Amount and date match' };
    }

    const nameInNarration = this.narrationContainsName(narration, r.customerName);
    if (nameInNarration && amountMatch) {
      return { receiptId: r.id, confidence: 0.7, matchReason: `Narration contains "${r.customerName}" + amount match` };
    }
    if (nameInNarration) {
      return { receiptId: r.id, confidence: 0.5, matchReason: `Narration contains "${r.customerName}"` };
    }

    return null;
  }

  private narrationContainsName(narration: string, name: string): boolean {
    if (!narration || !name) return false;
    const upper = narration.toUpperCase();
    const nameUpper = name.toUpperCase();

    if (upper.includes(nameUpper)) return true;

    const parsed = parseNamesFromNarration(narration);
    return parsed.some((n) => n.toUpperCase().includes(nameUpper) || nameUpper.includes(n.toUpperCase()));
  }
}

/** Extract potential names from bank narration patterns like "NEFT/FRESH DAIRY MART/UTR123" */
export function parseNamesFromNarration(narration: string): string[] {
  if (!narration) return [];
  const parts = narration.split(/[/\-|]/).map((s) => s.trim()).filter(Boolean);

  const prefixes = ['NEFT', 'RTGS', 'IMPS', 'UPI', 'NACH', 'ECS', 'ACH', 'INB', 'MOB', 'ATM'];
  return parts.filter((part) => {
    if (part.length < 3) return false;
    if (prefixes.includes(part.toUpperCase())) return false;
    if (/^\d+$/.test(part)) return false;
    if (/^[A-Z]{4}0[A-Z0-9]{6}$/.test(part)) return false;
    return true;
  });
}
