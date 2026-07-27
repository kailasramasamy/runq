export type CustomerType = 'b2b' | 'b2c' | 'payment_gateway';

export interface Customer {
  id: string;
  tenantId: string;
  name: string;
  nickname: string | null;
  type: CustomerType;
  email: string | null;
  ccEmail: string | null;
  phone: string | null;
  gstin: string | null;
  pan: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  creditLimit: number | null;
  paymentTermsDays: number;
  contactPerson: string | null;
  customerGroup: string | null;
  overdueInterestRate: number | null;
  defaultBankAccountId: string | null;
  holdReceiptsOnAccount: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerWithOutstanding extends Customer {
  outstandingAmount: number;
  overdueAmount: number;
  /** Total balance across draft (un-sent) invoices. Informational only —
   *  excluded from outstanding and credit-limit calculations. */
  draftAmount: number;
}
