import { pgTable, uuid, varchar, date, decimal, text, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { users } from '../user';
import { vendors } from './vendors';
import { purchaseInvoices } from './purchase-invoices';

export const paymentMethodEnum = pgEnum('payment_method', ['bank_transfer']);
export const paymentStatusEnum = pgEnum('payment_status', ['pending', 'completed', 'failed', 'reversed']);

export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  vendorId: uuid('vendor_id').notNull().references(() => vendors.id),
  bankAccountId: uuid('bank_account_id'),
  paymentDate: date('payment_date').notNull(),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  paymentMethod: paymentMethodEnum('payment_method').notNull().default('bank_transfer'),
  utrNumber: varchar('utr_number', { length: 50 }),
  status: paymentStatusEnum('status').notNull().default('pending'),
  notes: text('notes'),
  approvedBy: uuid('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const paymentAllocations = pgTable('payment_allocations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  paymentId: uuid('payment_id').notNull().references(() => payments.id),
  invoiceId: uuid('invoice_id').notNull().references(() => purchaseInvoices.id),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const advancePayments = pgTable('advance_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  vendorId: uuid('vendor_id').notNull().references(() => vendors.id),
  paymentId: uuid('payment_id').references(() => payments.id),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  balance: decimal('balance', { precision: 15, scale: 2 }).notNull(),
  advanceDate: date('advance_date').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const advanceAdjustments = pgTable('advance_adjustments', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  advanceId: uuid('advance_id').notNull().references(() => advancePayments.id),
  invoiceId: uuid('invoice_id').notNull().references(() => purchaseInvoices.id),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  adjustedAt: timestamp('adjusted_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
