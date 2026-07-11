export type BankTxnType = 'credit' | 'debit';
export type ReconStatus = 'unreconciled' | 'matched' | 'manually_matched' | 'excluded';

/** A single category slice of a bank account's spend or income. */
export interface ReportCategoryAmount {
  accountId: string | null;
  code: string | null;
  name: string;
  amount: number;
  percentage: number;
}

/** Per-account financial report: cash in/out on one bank account, by category. */
export interface BankAccountReport {
  accountId: string;
  period: { dateFrom: string; dateTo: string };
  summary: { moneyIn: number; moneyOut: number; net: number; txnCount: number };
  spendByCategory: ReportCategoryAmount[];
  incomeByCategory: ReportCategoryAmount[];
  byMonth: { month: string; moneyIn: number; moneyOut: number }[];
}

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
  memo: string | null;
  runningBalance: number | null;
  reconStatus: ReconStatus;
  importBatchId: string | null;
  vendorId: string | null;
  vendorName: string | null;
  customerId: string | null;
  customerName: string | null;
  journalEntryId: string | null;
  glAccountId: string | null;
  glAccountCode: string | null;
  glAccountName: string | null;
  glConfidence: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CategorizationResult {
  categorized: number;
  rulesMatched: number;
  aiMatched: number;
  suspensed: number;
  skipped: number;
}

export interface BankStatementImportResult {
  imported: number;
  duplicatesSkipped: number;
  errors: { row: number; message: string }[];
}

// --------------- Statement smart-import types ---------------

export interface ParsedStatementTransaction {
  transactionDate: string;
  valueDate?: string | null;
  type: 'credit' | 'debit';
  amount: number;
  reference: string | null;
  narration: string | null;
  runningBalance: number | null;
}

export interface ParsedStatementFile {
  fileName: string;
  transactions: ParsedStatementTransaction[];
  detectedAccountId: string | null;
  detectedBankName: string | null;
  parserUsed: 'spreadsheet' | 'text-heuristic' | 'ai';
  error?: string;
}

export interface StatementParseResult {
  files: ParsedStatementFile[];
  accounts: { id: string; name: string; bankName: string; lastSyncDate: string | null }[];
}

export interface StatementCommitInput {
  accountId: string;
  transactions: ParsedStatementTransaction[];
}
