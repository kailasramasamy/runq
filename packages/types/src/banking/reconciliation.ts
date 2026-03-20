export type ReconMatchType = 'auto_utr' | 'auto_amount_date' | 'manual';

export interface ReconciliationMatch {
  id: string;
  tenantId: string;
  bankTransactionId: string;
  paymentId: string | null;
  receiptId: string | null;
  matchType: ReconMatchType;
  matchedBy: string | null;
  matchedAt: string;
  createdAt: string;
}

export interface AutoReconciliationResult {
  matched: {
    bankTransactionId: string;
    matchedTo: { type: 'vendor_payment' | 'payment_receipt'; id: string };
    strategy: 'utr' | 'amount_date';
    amount: number;
    confidence: 'exact' | 'high';
  }[];
  unmatched: {
    bankTransactions: BankTransactionSummary[];
    payments: UnmatchedPaymentSummary[];
  };
  summary: {
    totalBankTxns: number;
    autoMatched: number;
    remainingUnmatched: number;
    matchRate: string;
  };
}

interface BankTransactionSummary {
  id: string;
  date: string;
  description: string | null;
  amount: number;
  type: 'credit' | 'debit';
}

interface UnmatchedPaymentSummary {
  id: string;
  type: 'vendor_payment' | 'payment_receipt';
  amount: number;
  date: string;
  referenceNumber: string | null;
}
