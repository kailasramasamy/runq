export type BankTxnType = 'credit' | 'debit';
export type ReconStatus = 'unreconciled' | 'matched' | 'manually_matched' | 'excluded';

export interface BankTransaction {
  id: string;
  tenantId: string;
  bankAccountId: string;
  transactionDate: string;
  valueDate: string | null;
  type: BankTxnType;
  amount: number;
  reference: string | null;
  narration: string | null;
  runningBalance: number | null;
  reconStatus: ReconStatus;
  importBatchId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BankStatementImportResult {
  imported: number;
  duplicatesSkipped: number;
  errors: { row: number; message: string }[];
}
