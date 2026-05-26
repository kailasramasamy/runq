export type VendorCategory = 'raw_material' | 'service_provider' | 'logistics' | 'utilities' | 'equipment' | 'other';

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
  earlyPaymentDiscountPercent: number | null;
  earlyPaymentDiscountDays: number | null;
  wmsVendorId: string | null;
  category: string | null;
  expenseAccountCode: string | null;
  treatNoBillAsAdvance: boolean;
  requiresInvoice: boolean;
  tags: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VendorWithOutstanding extends Vendor {
  outstandingAmount: number;
  overdueAmount: number;
  /**
   * AP Pattern-B (spec §4.1): count of (vendor, description) pairs that
   * have appeared 3+ times on bills in the last 60 days but are NOT yet
   * in the active vendor catalog. Drives the "frequent lines not in
   * catalog" badge on the vendor list and detail pages.
   */
  pendingCatalogCount: number;
}
