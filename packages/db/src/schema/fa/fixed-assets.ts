import { pgTable, uuid, varchar, date, decimal, text, boolean, timestamp, pgEnum, index, unique, integer } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { users } from '../user';
import { accounts } from '../gl/accounts';
import { purchaseInvoices } from '../ap/purchase-invoices';
import { vendors } from '../ap/vendors';
import { journalEntries } from '../gl/journal-entries';

// ─── Enums ────────────────────────────────────────────────────────────────────

export const depreciationMethodEnum = pgEnum('depreciation_method', ['slm', 'wdv']);
export const depreciationTypeEnum = pgEnum('depreciation_type', ['companies_act', 'it_act']);
export const assetStatusEnum = pgEnum('asset_status', ['active', 'disposed', 'written_off', 'cwip']);

// ─── Asset Categories ─────────────────────────────────────────────────────────

export const assetCategories = pgTable('asset_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  name: varchar('name', { length: 100 }).notNull(),
  parentId: uuid('parent_id'),

  // Companies Act (Schedule II) depreciation
  depMethodCompaniesAct: depreciationMethodEnum('dep_method_companies_act').notNull().default('slm'),
  depRateCompaniesAct: decimal('dep_rate_companies_act', { precision: 5, scale: 2 }).notNull(),
  usefulLifeYears: integer('useful_life_years'),

  // Income Tax Act (Section 32) depreciation
  depMethodItAct: depreciationMethodEnum('dep_method_it_act').notNull().default('wdv'),
  depRateItAct: decimal('dep_rate_it_act', { precision: 5, scale: 2 }).notNull(),

  // GL account codes for this category
  assetAccountCode: varchar('asset_account_code', { length: 20 }).notNull(),
  depExpenseAccountCode: varchar('dep_expense_account_code', { length: 20 }).notNull(),
  accumDepAccountCode: varchar('accum_dep_account_code', { length: 20 }).notNull(),

  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique().on(t.tenantId, t.name),
  index('idx_asset_cat_tenant').on(t.tenantId),
]);

// ─── Fixed Assets (the register) ─────────────────────────────────────────────

export const fixedAssets = pgTable('fixed_assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  assetCode: varchar('asset_code', { length: 30 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  categoryId: uuid('category_id').notNull().references(() => assetCategories.id),

  acquisitionDate: date('acquisition_date').notNull(),
  acquisitionCost: decimal('acquisition_cost', { precision: 15, scale: 2 }).notNull(),
  residualValue: decimal('residual_value', { precision: 15, scale: 2 }).notNull().default('0'),
  putToUseDate: date('put_to_use_date'), // drives depreciation start, can differ from acquisition

  location: varchar('location', { length: 255 }),
  serialNumber: varchar('serial_number', { length: 100 }),
  status: assetStatusEnum('status').notNull().default('active'),

  // Links to AP
  purchaseInvoiceId: uuid('purchase_invoice_id').references(() => purchaseInvoices.id),
  vendorId: uuid('vendor_id').references(() => vendors.id),

  // GST
  gstCreditClaimed: boolean('gst_credit_claimed').notNull().default(false),
  gstAmount: decimal('gst_amount', { precision: 15, scale: 2 }).notNull().default('0'),

  // Disposal
  disposalDate: date('disposal_date'),
  disposalAmount: decimal('disposal_amount', { precision: 15, scale: 2 }),
  disposalNotes: text('disposal_notes'),

  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique().on(t.tenantId, t.assetCode),
  index('idx_fa_tenant_category').on(t.tenantId, t.categoryId),
  index('idx_fa_tenant_status').on(t.tenantId, t.status),
]);

// ─── Depreciation Entries ─────────────────────────────────────────────────────

export const depreciationEntries = pgTable('depreciation_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  assetId: uuid('asset_id').notNull().references(() => fixedAssets.id),

  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  depreciationType: depreciationTypeEnum('depreciation_type').notNull(),
  method: depreciationMethodEnum('method').notNull(),
  rate: decimal('rate', { precision: 5, scale: 2 }).notNull(),

  openingWdv: decimal('opening_wdv', { precision: 15, scale: 2 }).notNull(),
  depreciationAmount: decimal('depreciation_amount', { precision: 15, scale: 2 }).notNull(),
  closingWdv: decimal('closing_wdv', { precision: 15, scale: 2 }).notNull(),

  journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id),
  isPosted: boolean('is_posted').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_dep_tenant_asset_period').on(t.tenantId, t.assetId, t.periodEnd),
  index('idx_dep_tenant_type_period').on(t.tenantId, t.depreciationType, t.periodEnd),
]);

// ─── Asset Sequences ──────────────────────────────────────────────────────────

export const assetSequences = pgTable('asset_sequences', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  financialYear: varchar('financial_year', { length: 10 }).notNull(),
  lastSequence: integer('last_sequence').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique().on(t.tenantId, t.financialYear),
]);

// ─── Asset Transfers ──────────────────────────────────────────────────────────

export const assetTransfers = pgTable('asset_transfers', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  assetId: uuid('asset_id').notNull().references(() => fixedAssets.id),
  fromLocation: varchar('from_location', { length: 255 }).notNull(),
  toLocation: varchar('to_location', { length: 255 }).notNull(),
  transferDate: date('transfer_date').notNull(),
  notes: text('notes'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_at_tenant_asset').on(t.tenantId, t.assetId),
]);
