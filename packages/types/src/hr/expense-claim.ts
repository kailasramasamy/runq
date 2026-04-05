export type ExpenseClaimStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'reimbursed';

export interface ExpenseClaim {
  id: string;
  tenantId: string;
  claimNumber: string;
  claimantId: string;
  claimantName?: string;
  claimDate: string;
  description: string | null;
  totalAmount: number;
  status: ExpenseClaimStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  reimbursedAt: string | null;
  items: ExpenseClaimItem[];
  createdAt: string;
}

export interface ExpenseClaimItem {
  id: string;
  expenseDate: string;
  category: string;
  description: string;
  amount: number;
  accountCode: string | null;
  receiptUrl: string | null;
}
