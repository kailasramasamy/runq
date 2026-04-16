import type { ItemAttributeSchema } from './masters/item';

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
  invoiceStartSequence?: number;
  invoiceSequencePadding?: number;
  financialYearStartMonth: number;
  defaultPaymentTermsDays: number;
  currency: string;
  // Company GST profile
  gstin?: string;
  // GST portal username — used to auto-populate authentication in GST filing flow
  gstUsername?: string;
  legalName?: string;
  state?: string;
  stateCode?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  pincode?: string;
  // UPI collection
  upiId?: string;
  // Default margin (%) applied to imported items when the source has no
  // margin column or the row's margin cell is blank.
  defaultMarginPercent?: number;
  // Chosen at signup from a fixed list (Manufacturing, Trading / Distribution,
  // Retail, Services, Construction, Food & Beverage, Healthcare, Hospitality,
  // Education, IT / Software, Other). Drives catalogue attribute seeding.
  industry?: string;
  // Catalogue attribute schema for the items master. Seeded from the industry
  // preset on first access (lazy) and persisted so tenants get a consistent
  // set of catalogue fields. Phase 2 will let tenants edit this in Settings.
  itemAttributeSchema?: ItemAttributeSchema;
  // Email provider
  emailProvider?: 'resend' | 'sendgrid' | 'smtp' | null;
  emailConfig?: {
    apiKey?: string;
    smtpHost?: string;
    smtpPort?: number;
    smtpSecure?: boolean;
    smtpUser?: string;
    smtpPass?: string;
    fromEmail?: string;
    fromName?: string;
  };
}
