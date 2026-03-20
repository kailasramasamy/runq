export interface PettyCashAccount {
  id: string;
  tenantId: string;
  name: string;
  location: string | null;
  cashLimit: number;
  currentBalance: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type PettyCashTxnType = 'expense' | 'replenishment';
export type PettyCashCategory = 'office_supplies' | 'travel' | 'food' | 'maintenance' | 'other';

export interface PettyCashTransaction {
  id: string;
  tenantId: string;
  accountId: string;
  transactionDate: string;
  type: PettyCashTxnType;
  amount: number;
  description: string;
  category: PettyCashCategory | null;
  approvedBy: string | null;
  receiptUrl: string | null;
  createdAt: string;
  updatedAt: string;
}
