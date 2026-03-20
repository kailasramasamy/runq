import { pgTable, uuid, varchar, date, decimal, text, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { vendors } from './vendors';
import { purchaseInvoices } from './purchase-invoices';

export const debitNoteStatusEnum = pgEnum('debit_note_status', ['draft', 'issued', 'adjusted', 'cancelled']);

export const debitNotes = pgTable('debit_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  debitNoteNumber: varchar('debit_note_number', { length: 50 }).notNull(),
  vendorId: uuid('vendor_id').notNull().references(() => vendors.id),
  invoiceId: uuid('invoice_id').references(() => purchaseInvoices.id),
  issueDate: date('issue_date').notNull(),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  reason: text('reason').notNull(),
  status: debitNoteStatusEnum('status').notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
