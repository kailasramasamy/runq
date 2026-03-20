export type CustomerType = 'b2b' | 'payment_gateway';

export interface Customer {
  id: string;
  tenantId: string;
  name: string;
  type: CustomerType;
  email: string | null;
  phone: string | null;
  gstin: string | null;
  pan: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  paymentTermsDays: number;
  contactPerson: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerWithOutstanding extends Customer {
  outstandingAmount: number;
  overdueAmount: number;
}
