import { pgTable, uuid, varchar, date, decimal, integer, boolean, timestamp, pgEnum, index } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { users } from '../user';
import { vendors } from './vendors';

export const recurringBillCategoryEnum = pgEnum('recurring_bill_category', ['rent', 'transport', 'other']);
/** `semi_monthly` raises two bills a month, on the 1st and the 16th, each half the amount. */
export const recurringBillFrequencyEnum = pgEnum('recurring_bill_frequency', ['monthly', 'semi_monthly']);

/**
 * A fixed monthly commitment to a vendor — a landlord's rent, a transporter's
 * monthly hire. Each month it raises one approved bill (purchase_invoices
 * carries recurring_bill_id + recurring_period), which is then paid, part-paid
 * or settled from an advance through the normal AP payment flow.
 */
export const recurringBills = pgTable('recurring_bills', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  vendorId: uuid('vendor_id').notNull().references(() => vendors.id),
  title: varchar('title', { length: 120 }).notNull(),
  category: recurringBillCategoryEnum('category').notNull(),
  /** GL account the monthly bill debits — 5301 rent / 5700 transport by default. */
  expenseAccountCode: varchar('expense_account_code', { length: 20 }).notNull(),
  /** The monthly total; a semi-monthly agreement bills half of it twice. */
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  frequency: recurringBillFrequencyEnum('frequency').notNull().default('monthly'),
  /** Monthly only: day of the month the bill is dated and falls due; capped at 28. */
  billDay: integer('bill_day').notNull().default(1),
  /** First and (optional) last month billed, stored as the 1st of the month. */
  startMonth: date('start_month').notNull(),
  endMonth: date('end_month'),
  isActive: boolean('is_active').notNull().default(true),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_recurring_bills_tenant').on(t.tenantId, t.isActive),
  index('idx_recurring_bills_vendor').on(t.tenantId, t.vendorId),
]);
