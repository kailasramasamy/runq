import {
  pgTable, uuid, varchar, text, boolean, integer, decimal, date, timestamp, index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { users } from '../user';
import { vendors } from '../ap/vendors';
import { payments } from '../ap/payments';
import { journalEntries } from '../gl/journal-entries';
import { accounts } from '../gl/accounts';
import { warehouses } from '../inventory/warehouses';
import { items } from '../masters/items';
import { mpNodes } from './nodes';
import { mpOperatorRole, mpCompType, mpPayoutMode, mpMilkType } from './enums';

/**
 * Who runs a node + their comp TERMS only. Actual operator/rent payouts flow
 * through existing AP/payroll — Dhenu just computes commission from pour volume.
 */
export const mpNodeOperators = pgTable('mp_node_operators', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  nodeId: uuid('node_id').notNull().references(() => mpNodes.id),
  userId: uuid('user_id').references(() => users.id),
  // Responsible person for this node — name + mobile shown in web & app; the
  // mobile doubles as the Dhenu login phone (DOB lives in mp_credentials).
  name: varchar('name', { length: 255 }),
  phone: varchar('phone', { length: 20 }),
  payeeVendorId: uuid('payee_vendor_id').references(() => vendors.id),
  role: mpOperatorRole('role').notNull().default('operator'),
  compType: mpCompType('comp_type').notNull(),
  ratePerLitre: decimal('rate_per_litre', { precision: 15, scale: 2 }),
  monthlySalary: decimal('monthly_salary', { precision: 15, scale: 2 }),
  rentAmount: decimal('rent_amount', { precision: 15, scale: 2 }),
  effectiveFrom: date('effective_from').notNull(),
  effectiveTo: date('effective_to'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_mp_node_operators_node').on(t.tenantId, t.nodeId),
]);

/** Per-tenant document numbering, mirrors gl `journal_sequences`. */
export const mpSequences = pgTable('mp_sequences', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  docType: varchar('doc_type', { length: 20 }).notNull(), // receipt|consignment|cycle|statement
  financialYear: varchar('financial_year', { length: 10 }).notNull(),
  lastSequence: integer('last_sequence').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('uq_mp_sequences').on(t.tenantId, t.docType, t.financialYear),
]);

/** Tenant-level Dhenu config + GL account mapping (one row per tenant). */
export const mpGlSettings = pgTable('mp_gl_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  defaultPayoutMode: mpPayoutMode('default_payout_mode').notNull().default('direct_to_farmer'),
  // Collection/payout cycle: cadence (cycleDays from cycleAnchorDate) +
  // whether the daily scheduler auto-generates each cycle as its period closes.
  cycleDays: integer('cycle_days'),
  cycleAnchorDate: date('cycle_anchor_date'),
  autoGenerateCycle: boolean('auto_generate_cycle').notNull().default(false),
  // Support contacts shown on the app's Help & Support screen (all personas read).
  supportPhone: text('support_phone'),
  supportEmail: text('support_email'),
  supportWhatsapp: text('support_whatsapp'),
  milkPurchaseAccountId: uuid('milk_purchase_account_id').references(() => accounts.id),
  farmerPayableAccountId: uuid('farmer_payable_account_id').references(() => accounts.id),
  qualityBonusAccountId: uuid('quality_bonus_account_id').references(() => accounts.id),
  advanceAccountId: uuid('advance_account_id').references(() => accounts.id),
  feedLoanAccountId: uuid('feed_loan_account_id').references(() => accounts.id),
  rawMilkInventoryAccountId: uuid('raw_milk_inventory_account_id').references(() => accounts.id),
  // Expense account for VMCC operator commission/handling (default code 5060),
  // booked when a VMCC bill is paid. See mp_vmcc_bills.
  commissionExpenseAccountId: uuid('commission_expense_account_id').references(() => accounts.id),
  // Single warehouse all PP raw-milk receipts post into (P1.2, §9.4).
  rawMilkWarehouseId: uuid('raw_milk_warehouse_id').references(() => warehouses.id),
  varianceAccountId: uuid('variance_account_id').references(() => accounts.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('uq_mp_gl_settings_tenant').on(t.tenantId),
]);

export type MpNodeOperatorRow = typeof mpNodeOperators.$inferSelect;
export type NewMpNodeOperatorRow = typeof mpNodeOperators.$inferInsert;

/**
 * Lightweight operator-payout record — one row per (operator, period) marked
 * paid. Amounts are snapshotted at pay time (commission = node volume × rate,
 * plus salary + rent). Actual disbursement still flows through AP/payroll; this
 * just tracks what was paid, mirroring the farmer ledger.
 */
export const mpOperatorPayouts = pgTable('mp_operator_payouts', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  operatorId: uuid('operator_id').notNull().references(() => mpNodeOperators.id),
  nodeId: uuid('node_id').notNull().references(() => mpNodes.id),
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  nodeQty: decimal('node_qty', { precision: 12, scale: 3 }).notNull().default('0'),
  commission: decimal('commission', { precision: 15, scale: 2 }).notNull().default('0'),
  salary: decimal('salary', { precision: 15, scale: 2 }).notNull().default('0'),
  rent: decimal('rent', { precision: 15, scale: 2 }).notNull().default('0'),
  total: decimal('total', { precision: 15, scale: 2 }).notNull().default('0'),
  payeeVendorId: uuid('payee_vendor_id').references(() => vendors.id),
  paidOn: date('paid_on').notNull(),
  reference: varchar('reference', { length: 120 }),
  // Set when settled from the billing page (GL + AP payment posted); null when
  // recorded as a lightweight payout from the Operators tab.
  paymentMode: varchar('payment_mode', { length: 30 }),
  journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id),
  paymentId: uuid('payment_id').references(() => payments.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('uq_mp_operator_payout_period').on(t.tenantId, t.operatorId, t.periodStart, t.periodEnd),
  index('idx_mp_operator_payout_node').on(t.tenantId, t.nodeId, t.periodStart),
]);

export type MpOperatorPayoutRow = typeof mpOperatorPayouts.$inferSelect;
export type NewMpOperatorPayoutRow = typeof mpOperatorPayouts.$inferInsert;

/**
 * Maps each milk type to the inventory item a PP raw-milk receipt posts into
 * (P1.2, §9.4). One item per type so manufacturing can consume cow vs buffalo
 * separately. Unmapped type → the PP receipt skips stock posting (best-effort).
 */
export const mpRawMilkItems = pgTable('mp_raw_milk_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  milkType: mpMilkType('milk_type').notNull(),
  itemId: uuid('item_id').notNull().references(() => items.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('uq_mp_raw_milk_items').on(t.tenantId, t.milkType),
]);

export type MpRawMilkItemRow = typeof mpRawMilkItems.$inferSelect;
export type NewMpRawMilkItemRow = typeof mpRawMilkItems.$inferInsert;
