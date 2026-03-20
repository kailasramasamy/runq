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
}
