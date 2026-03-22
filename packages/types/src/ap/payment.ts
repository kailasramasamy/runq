export type PaymentBatchStatus = 'pending_approval' | 'partially_approved' | 'approved' | 'rejected' | 'executed';
export type InstructionStatus = 'pending' | 'approved' | 'rejected' | 'paid' | 'failed';

export interface PaymentBatch {
  id: string;
  tenantId: string;
  batchId: string;
  source: string;
  description: string | null;
  status: PaymentBatchStatus;
  totalCount: number;
  totalAmount: number;
  approvedCount: number;
  approvedAmount: number;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentInstruction {
  id: string;
  tenantId: string;
  batchId: string;
  vendorId: string | null;
  vendorName: string;
  amount: number;
  reference: string | null;
  reason: string | null;
  dueDate: string | null;
  status: InstructionStatus;
  paymentId: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface PaymentBatchWithInstructions extends PaymentBatch {
  instructions: PaymentInstruction[];
}

export interface ExecuteBatchResult {
  paid: number;
  failed: number;
  totalPaid: number;
}

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
  approvedBy: string | null;
  approvedAt: string | null;
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

export interface BatchPaymentResult {
  created: number;
  totalAmount: number;
  payments: VendorPayment[];
}

export interface BatchImportError {
  row: number;
  vendorName: string;
  message: string;
}

export interface BatchImportResult {
  created: number;
  totalAmount: number;
  skipped: number;
  errors: BatchImportError[];
}
