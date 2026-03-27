export type TenantId = string;

export interface Tenant {
  id: TenantId;
  name: string;
  slug: string;
  settings: TenantSettings;
  createdAt: string;
  updatedAt: string;
}

export interface TenantSettings {
  invoicePrefix: string;
  invoiceFormat: string;
  financialYearStartMonth: number;
  defaultPaymentTermsDays: number;
  currency: string;
  // Company GST profile
  gstin?: string;
  legalName?: string;
  state?: string;
  stateCode?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  pincode?: string;
  // UPI collection
  upiId?: string;
}
