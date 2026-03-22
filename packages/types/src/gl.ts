export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export interface Account {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  type: AccountType;
  parentId: string | null;
  isActive: boolean;
  isSystemAccount: boolean;
  description: string | null;
}

export interface JournalEntry {
  id: string;
  tenantId: string;
  entryNumber: string;
  date: string;
  description: string;
  status: string;
  sourceType: string | null;
  sourceId: string | null;
  totalDebit: number;
  totalCredit: number;
  createdBy: string | null;
  createdAt: string;
}

export interface JournalLine {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  description: string | null;
}

export interface JournalEntryWithLines extends JournalEntry {
  lines: JournalLine[];
}

export interface TrialBalanceRow {
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  debit: number;
  credit: number;
  balance: number;
}
