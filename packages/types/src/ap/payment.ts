export type PaymentMethod = 'bank_transfer';
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'reversed';

export interface VendorPayment {
  id: string;
  tenantId: string;
  vendorId: string;
  bankAccountId: string | null;
  paymentDate: string;
  amount: number;
  paymentMethod: PaymentMethod;
  utrNumber: string | null;
  status: PaymentStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentAllocation {
  id: string;
  tenantId: string;
  paymentId: string;
  invoiceId: string;
  amount: number;
  createdAt: string;
}

export interface AdvancePayment {
  id: string;
  tenantId: string;
  vendorId: string;
  paymentId: string | null;
  amount: number;
  balance: number;
  advanceDate: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdvanceAdjustment {
  id: string;
  tenantId: string;
  advanceId: string;
  invoiceId: string;
  amount: number;
  adjustedAt: string;
}

export interface VendorPaymentWithAllocations extends VendorPayment {
  allocations: (PaymentAllocation & {
    invoiceNumber: string;
    invoiceTotal: number;
    invoiceBalanceDue: number;
  })[];
  vendorName: string;
}
