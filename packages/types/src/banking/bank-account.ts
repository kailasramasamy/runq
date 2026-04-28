export type BankAccountType = 'current' | 'savings' | 'overdraft' | 'cash_credit';

export interface BankAccount {
  id: string;
  tenantId: string;
  name: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  accountType: BankAccountType;
  openingBalance: number;
  currentBalance: number;
  glAccountId: string | null;
  logoUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
