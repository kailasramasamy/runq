export interface FeedTransaction {
  transactionDate: string;
  valueDate: string | null;
  type: 'credit' | 'debit';
  amount: number;
  reference: string;
  narration: string;
  runningBalance: number | null;
}

export interface FeedBalance {
  accountId: string;
  balance: number;
  asOf: string;
}

export interface PaymentInitiationParams {
  beneficiaryAccount: string;
  ifsc: string;
  amount: number;
  reference: string;
  narration: string;
}

export interface PaymentInitiationResult {
  transactionId: string;
  status: 'completed';
  utrNumber: string;
}

export interface BankFeedProvider {
  fetchTransactions(accountId: string, fromDate: string, toDate: string): Promise<FeedTransaction[]>;
  getBalance(accountId: string): Promise<FeedBalance>;
  initiatePayment(params: PaymentInitiationParams): Promise<PaymentInitiationResult>;
}
