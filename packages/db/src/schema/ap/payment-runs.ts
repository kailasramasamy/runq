import { pgTable, uuid, varchar, text, decimal, integer, timestamp, date, pgEnum, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { users } from '../user';
import { vendors } from './vendors';
import { payments } from './payments';
import { purchaseInvoices } from './purchase-invoices';

export const paymentRunStatusEnum = pgEnum('payment_run_status', [
  'pending_approval',
  'partially_approved',
  'approved',
  'rejected',
  'executed',
]);

export const paymentRunLineStatusEnum = pgEnum('payment_run_line_status', [
  'pending',
  'approved',
  'rejected',
  'paid',
  'failed',
]);

export const paymentRuns = pgTable(
  'payment_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    runId: varchar('run_id', { length: 100 }).notNull(),
    source: varchar('source', { length: 100 }).notNull(),
    description: text('description'),
    status: paymentRunStatusEnum('status').notNull().default('pending_approval'),
    totalCount: integer('total_count').notNull(),
    totalAmount: decimal('total_amount', { precision: 15, scale: 2 }).notNull(),
    approvedCount: integer('approved_count').notNull().default(0),
    approvedAmount: decimal('approved_amount', { precision: 15, scale: 2 }).notNull().default('0'),
    approvedBy: uuid('approved_by').references(() => users.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantRunUniq: uniqueIndex('payment_runs_tenant_run_id_uniq').on(t.tenantId, t.runId),
    tenantStatusIdx: index('payment_runs_tenant_status_idx').on(t.tenantId, t.status),
  }),
);

export const paymentRunLines = pgTable(
  'payment_run_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    runId: uuid('run_id').notNull().references(() => paymentRuns.id),
    vendorId: uuid('vendor_id').references(() => vendors.id),
    vendorName: varchar('vendor_name', { length: 255 }).notNull(),
    amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
    reference: varchar('reference', { length: 100 }),
    reason: text('reason'),
    dueDate: date('due_date'),
    status: paymentRunLineStatusEnum('status').notNull().default('pending'),
    paymentId: uuid('payment_id').references(() => payments.id),
    purchaseInvoiceId: uuid('purchase_invoice_id').references(() => purchaseInvoices.id),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantRunIdx: index('payment_run_lines_tenant_run_idx').on(t.tenantId, t.runId),
    tenantStatusIdx: index('payment_run_lines_tenant_status_idx').on(t.tenantId, t.status),
    invoiceIdx: index('payment_run_lines_invoice_idx').on(t.purchaseInvoiceId),
  }),
);
