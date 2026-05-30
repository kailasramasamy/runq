import { pgTable, uuid, varchar, decimal, jsonb, text, timestamp, pgEnum, index, unique, boolean } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { users } from '../user';
import { salesInvoices } from '../ar/invoices';
import { creditNotes } from '../ar/credit-notes';

// ── Enums ──────────────────────────────────────────────────────────────

export const gstReturnTypeEnum = pgEnum('gst_return_type', [
  'gstr1',
  'gstr3b',
]);

export const gstReturnStatusEnum = pgEnum('gst_return_status', [
  'draft',        // generated from invoices, not yet validated
  'validated',    // pre-flight checks passed
  'uploaded',     // pushed to GSTN via GSP
  'filed',        // filed with EVC/DSC, ARN received
  'error',        // upload or filing failed
]);

export const gstFilingFrequencyEnum = pgEnum('gst_filing_frequency', [
  'monthly',
  'quarterly',
]);

export const gstr1SectionEnum = pgEnum('gstr1_section', [
  'b2b',    // Table 4A — invoices to registered dealers
  'b2cl',   // Table 5A — large invoices to unregistered (inter-state > 2.5L)
  'b2cs',   // Table 7  — small invoices to unregistered
  'cdn',    // Table 9B — credit/debit notes to registered dealers
  'exp',    // Table 6A — exports
  'nil',    // Table 8  — nil-rated/exempt supplies
]);

// ── GSTR-1 / GSTR-3B section data types ───────────────────────────────

export type Gstr1B2BInvoice = {
  invoiceId?: string;        // local invoice UUID for cross-reference
  buyerGstin: string;
  invoiceNumber: string;
  invoiceDate: string;       // DD-MM-YYYY
  invoiceValue: number;
  placeOfSupply: string;     // 2-digit state code
  reverseCharge: 'Y' | 'N';
  invoiceType: 'R' | 'SEWP' | 'SEWOP' | 'DE';
  items: Array<{
    taxableValue: number;
    igstAmount: number;
    cgstAmount: number;
    sgstAmount: number;
    cessAmount: number;
    gstRate: number;
  }>;
};

export type Gstr1B2CSEntry = {
  placeOfSupply: string;
  supplyType: 'INTRA' | 'INTER';
  gstRate: number;
  taxableValue: number;
  igstAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  cessAmount: number;
};

export type Gstr1CDNEntry = {
  creditNoteId?: string;     // local credit note UUID for cross-reference
  buyerGstin: string;
  noteNumber: string;
  noteDate: string;
  noteType: 'C' | 'D';
  originalInvoiceNumber: string;
  originalInvoiceDate: string;
  noteValue: number;
  items: Array<{
    taxableValue: number;
    igstAmount: number;
    cgstAmount: number;
    sgstAmount: number;
    cessAmount: number;
    gstRate: number;
  }>;
};

export type Gstr1HSNEntry = {
  hsnCode: string;
  description: string;
  uqc: string;             // unit code: NOS, KGS, MTR, LTR, etc.
  totalQuantity: number;
  taxableValue: number;
  igstAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  cessAmount: number;
  gstRate: number;
};

export type Gstr1DocSummary = {
  docType: string;          // invoice, credit note, debit note, etc.
  fromSerial: string;
  toSerial: string;
  totalIssued: number;
  totalCancelled: number;
  netIssued: number;
};

export type Gstr1Data = {
  b2b: Gstr1B2BInvoice[];
  b2cs: Gstr1B2CSEntry[];
  b2cl: Array<{
    invoiceId?: string;
    invoiceNumber: string;
    invoiceDate: string;
    invoiceValue: number;
    placeOfSupply: string;
    gstRate: number;
    taxableValue: number;
    igstAmount: number;
  }>;
  cdn: Gstr1CDNEntry[];
  // Table 9A — amended B2B invoices, including invoices that were missed in a
  // prior period's filed return and are being added now with their original
  // (prior-period) invoice date. Same shape as b2b plus an originalPeriod hint.
  b2ba?: Array<Gstr1B2BInvoice & { originalPeriod?: string }>;
  exp: Array<{
    invoiceNumber: string;
    invoiceDate: string;
    invoiceValue: number;
    portCode: string;
    shippingBillNumber: string;
    shippingBillDate: string;
    withPayment: boolean;
    taxableValue: number;
    igstAmount: number;
    cessAmount: number;
    gstRate: number;
  }>;
  nil: Array<{
    supplyType: 'INTRA' | 'INTER';
    nilRatedAmount: number;
    exemptAmount: number;
    nonGstAmount: number;
  }>;
  hsn: Gstr1HSNEntry[];
  docs: Gstr1DocSummary[];
};

export type Gstr3bData = {
  table31: {
    outwardTaxableInterState: { taxableValue: number; igst: number; cess: number };
    outwardTaxableIntraState: { taxableValue: number; cgst: number; sgst: number; cess: number };
    zeroRatedSupplies: { taxableValue: number; igst: number; cess: number };
    nilRatedExempt: { taxableValue: number };
    nonGstOutward: { taxableValue: number };
  };
  table32: Array<{
    placeOfSupply: string;
    taxableValue: number;
    igst: number;
  }>;
  table4: {
    itcAvailable: {
      importGoods: { igst: number; cgst: number; sgst: number; cess: number };
      importServices: { igst: number; cgst: number; sgst: number; cess: number };
      inwardReverseCharge: { igst: number; cgst: number; sgst: number; cess: number };
      isd: { igst: number; cgst: number; sgst: number; cess: number };
      allOtherItc: { igst: number; cgst: number; sgst: number; cess: number };
    };
    itcReversed: {
      rule4243: { igst: number; cgst: number; sgst: number; cess: number };
      others: { igst: number; cgst: number; sgst: number; cess: number };
    };
    netItc: { igst: number; cgst: number; sgst: number; cess: number };
  };
  table5: {
    interState: { nilRated: number; exempt: number; nonGst: number };
    intraState: { nilRated: number; exempt: number; nonGst: number };
  };
  table51: {
    interestAmount: number;
    lateFee: number;
  };
  table61: {
    igst: { payable: number; itcUsed: number; cashPaid: number };
    cgst: { payable: number; itcUsed: number; cashPaid: number };
    sgst: { payable: number; itcUsed: number; cashPaid: number };
    cess: { payable: number; itcUsed: number; cashPaid: number };
  };
};

// ── Tables ─────────────────────────────────────────────────────────────

export const gstReturns = pgTable('gst_returns', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  gstin: varchar('gstin', { length: 15 }).notNull(),
  returnType: gstReturnTypeEnum('return_type').notNull(),
  period: varchar('period', { length: 6 }).notNull(),               // MMYYYY
  filingFrequency: gstFilingFrequencyEnum('filing_frequency').notNull().default('monthly'),
  status: gstReturnStatusEnum('status').notNull().default('draft'),
  data: jsonb('data').$type<Gstr1Data | Gstr3bData>(),              // full return payload
  errorDetails: jsonb('error_details').$type<Array<{ code: string; message: string; section?: string }>>(),
  // Post-save verification: after we save a 3B/1 to GSTN, we re-fetch
  // the stored summary and diff against what we sent. Any non-trivial
  // drift (section silently dropped, value mismatch beyond Re 1) is
  // recorded here so the UI can warn before the user clicks File and
  // discovers a downstream compute failure (e.g. RT-3BGC-9017).
  verifyDrift: jsonb('verify_drift').$type<Array<{
    section: string;
    field: string;
    sent: number;
    stored: number;
    delta: number;
  }>>(),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  arn: varchar('arn', { length: 50 }),                               // acknowledgement ref from GSTN
  filedAt: timestamp('filed_at', { withTimezone: true }),
  filedBy: uuid('filed_by').references(() => users.id),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('uq_gst_return_period').on(t.tenantId, t.returnType, t.period),
  index('idx_gst_ret_tenant_status').on(t.tenantId, t.status),
  index('idx_gst_ret_tenant_period').on(t.tenantId, t.period),
]);

export const gstReturnInvoices = pgTable('gst_return_invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  returnId: uuid('return_id').notNull().references(() => gstReturns.id, { onDelete: 'cascade' }),
  invoiceId: uuid('invoice_id'),
  creditNoteId: uuid('credit_note_id'),
  section: gstr1SectionEnum('section').notNull(),
  included: boolean('included').notNull().default(true),
  amendmentOfReturnId: uuid('amendment_of_return_id').references(() => gstReturns.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_gst_ri_return').on(t.returnId),
  index('idx_gst_ri_invoice').on(t.invoiceId),
]);

export const gspAuthTokens = pgTable('gsp_auth_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  gstin: varchar('gstin', { length: 15 }).notNull(),
  gspProvider: varchar('gsp_provider', { length: 50 }).notNull(),
  accessToken: text('access_token').notNull(),
  txn: varchar('txn', { length: 100 }),  // transaction ID for White Books API
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_gsp_auth_tenant_gstin').on(t.tenantId, t.gstin),
]);

// ── GSTR-2B Tables ─────────────────────────────────────────────────────

export const gstr2bMatchStatusEnum = pgEnum('gstr2b_match_status', [
  'matched',       // exact match with purchase invoice
  'mismatched',    // found but values differ
  'not_in_books',  // in 2B but no matching purchase invoice
  'not_in_2b',     // in books but supplier hasn't reported
]);

export const gstr2bData = pgTable('gstr2b_data', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  gstin: varchar('gstin', { length: 15 }).notNull(),
  period: varchar('period', { length: 6 }).notNull(),          // MMYYYY
  data: jsonb('data').notNull(),                                // raw 2B response from GSTN
  pulledAt: timestamp('pulled_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('uq_gstr2b_period').on(t.tenantId, t.period),
  index('idx_gstr2b_tenant_period').on(t.tenantId, t.period),
]);

export type Gstr2bEntry = {
  supplierGstin: string;
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string;
  invoiceValue: number;
  taxableValue: number;
  igstAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  cessAmount: number;
  gstRate: number;
  placeOfSupply: string;
  reverseCharge: boolean;
};

export const gstr2bMatches = pgTable('gstr2b_matches', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  gstr2bId: uuid('gstr2b_id').notNull().references(() => gstr2bData.id, { onDelete: 'cascade' }),
  period: varchar('period', { length: 6 }).notNull(),
  // 2B side
  supplierGstin: varchar('supplier_gstin', { length: 15 }).notNull(),
  supplierName: varchar('supplier_name', { length: 255 }),
  invoiceNumber2b: varchar('invoice_number_2b', { length: 50 }).notNull(),
  invoiceDate2b: varchar('invoice_date_2b', { length: 10 }),
  taxableValue2b: decimal('taxable_value_2b', { precision: 15, scale: 2 }).notNull().default('0'),
  igst2b: decimal('igst_2b', { precision: 15, scale: 2 }).notNull().default('0'),
  cgst2b: decimal('cgst_2b', { precision: 15, scale: 2 }).notNull().default('0'),
  sgst2b: decimal('sgst_2b', { precision: 15, scale: 2 }).notNull().default('0'),
  // Books side
  purchaseInvoiceId: uuid('purchase_invoice_id'),
  invoiceNumberBooks: varchar('invoice_number_books', { length: 50 }),
  taxableValueBooks: decimal('taxable_value_books', { precision: 15, scale: 2 }),
  igstBooks: decimal('igst_books', { precision: 15, scale: 2 }),
  cgstBooks: decimal('cgst_books', { precision: 15, scale: 2 }),
  sgstBooks: decimal('sgst_books', { precision: 15, scale: 2 }),
  // Match result
  matchStatus: gstr2bMatchStatusEnum('match_status').notNull(),
  valueDiff: decimal('value_diff', { precision: 15, scale: 2 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_gstr2b_match_tenant_period').on(t.tenantId, t.period),
  index('idx_gstr2b_match_status').on(t.tenantId, t.matchStatus),
  index('idx_gstr2b_match_pi').on(t.purchaseInvoiceId),
]);
