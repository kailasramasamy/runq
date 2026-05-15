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
  // PAN of the authorized signatory (partner/director registered on GST portal)
  // Used for EVC OTP requests during filing. May differ from the firm/entity
  // PAN that's embedded in the GSTIN.
  gstAuthSignatoryPan?: string;
  // First period (MMYYYY) for which runq manages GST filing. Periods before
  // this are assumed filed externally (e.g. by a CA) and skipped by the
  // readiness tracker and scheduler.
  gstFilingStartPeriod?: string;
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
  // Payroll statutory profile — registration identifiers printed on challans
  // and statutory returns (ESIC employer code, EPFO establishment code,
  // Professional Tax enrolment no., and TAN for Form 24Q).
  esiRegistrationNumber?: string;
  pfEstablishmentCode?: string;
  ptRegistrationNumber?: string;
  tan?: string;
  // Statutory toggles — when false, payroll runs skip the corresponding
  // deduction/contribution entirely. Undefined defaults to enabled, so existing
  // tenants keep the current behaviour. EPS is a sub-toggle of PF: PF without
  // EPS is a legitimate config for ₹15k+ joiners after Sep 2014, where the
  // employer's full 12% lands in A/c 1 instead of diverting 8.33% to A/c 10.
  payrollPfEnabled?: boolean;
  payrollEpsEnabled?: boolean;
  payrollPtEnabled?: boolean;
  payrollTdsEnabled?: boolean;
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
  // Storage key for the company logo. Used in the letter PDF header.
  companyLogoUrl?: string | null;
  // HR letter signatory — used at the bottom of every issued letter.
  // signatureImageUrl is a storage key for the uploaded signature PNG.
  // HR helpdesk AI agent configuration. Off by default; enable + tier-up
   // per category to graduate from draft-only to auto-send.
  agentSupport?: {
    enabled: boolean;
    faqs: string;
    operatorUserId?: string | null;
    perCategory: Partial<Record<
      'payroll' | 'leave' | 'attendance' | 'reimbursement' | 'asset' | 'it' | 'document' | 'general',
      { tier: 0 | 1 | 2 | 3; autoResolve: boolean }
    >>;
  };
  hrSignatory?: {
    name?: string | null;
    designation?: string | null;
    email?: string | null;
    signatureImageUrl?: string | null;
  };
}
