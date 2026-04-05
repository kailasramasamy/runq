import { pgTable, uuid, varchar, date, decimal, timestamp, pgEnum, index } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { users } from '../user';
import { vendors } from './vendors';
import { purchaseInvoices } from './purchase-invoices';

export const paymentScheduleStatusEnum = pgEnum('payment_schedule_status', ['draft', 'approved', 'processing', 'completed', 'cancelled']);

export const paymentSchedules = pgTable('payment_schedules', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  name: varchar('name', { length: 100 }).notNull(),
  scheduledDate: date('scheduled_date').notNull(),
  status: paymentScheduleStatusEnum('status').notNull().default('draft'),
  totalAmount: decimal('total_amount', { precision: 15, scale: 2 }).notNull().default('0'),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  approvedBy: uuid('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index().on(t.tenantId, t.status),
  index().on(t.tenantId, t.scheduledDate),
]);

export const paymentScheduleItems = pgTable('payment_schedule_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  scheduleId: uuid('schedule_id').notNull().references(() => paymentSchedules.id),
  invoiceId: uuid('invoice_id').notNull().references(() => purchaseInvoices.id),
  vendorId: uuid('vendor_id').notNull().references(() => vendors.id),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index().on(t.tenantId, t.scheduleId),
]);
