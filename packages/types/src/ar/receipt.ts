export interface PaymentReceipt {
  id: string;
  tenantId: string;
  customerId: string;
  bankAccountId: string | null;
  receiptDate: string;
  amount: number;
  paymentMethod: string;
  referenceNumber: string | null;
  notes: string | null;
  isOnAccount: boolean;
  /** Sum of this receipt's allocations to invoices. `amount − allocatedAmount`
   *  is the unallocated (on-account) remainder. */
  allocatedAmount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ReceiptAllocation {
  id: string;
  tenantId: string;
  receiptId: string;
  invoiceId: string;
  amount: number;
  createdAt: string;
}
