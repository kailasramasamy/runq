import { pgTable, uuid, varchar, date, decimal, text, timestamp } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { customers } from './customers';
import { salesInvoices } from './invoices';
import { paymentMethodEnum } from '../ap/payments';

export const paymentReceipts = pgTable('payment_receipts', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  bankAccountId: uuid('bank_account_id'),
  receiptDate: date('receipt_date').notNull(),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  paymentMethod: paymentMethodEnum('payment_method').notNull(),
  referenceNumber: varchar('reference_number', { length: 100 }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const receiptAllocations = pgTable('receipt_allocations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  receiptId: uuid('receipt_id').notNull().references(() => paymentReceipts.id),
  invoiceId: uuid('invoice_id').notNull().references(() => salesInvoices.id),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
