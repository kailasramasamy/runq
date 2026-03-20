export interface Vendor {
  id: string;
  tenantId: string;
  name: string;
  gstin: string | null;
  pan: string | null;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  bankName: string | null;
  paymentTermsDays: number;
  wmsVendorId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VendorWithOutstanding extends Vendor {
  outstandingAmount: number;
  overdueAmount: number;
}
