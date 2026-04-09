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
