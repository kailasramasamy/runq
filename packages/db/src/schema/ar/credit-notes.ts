import { pgTable, uuid, varchar, date, decimal, text, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { customers } from './customers';
import { salesInvoices } from './invoices';

export const creditNoteStatusEnum = pgEnum('credit_note_status', ['draft', 'issued', 'adjusted', 'cancelled']);

export const creditNotes = pgTable('credit_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  creditNoteNumber: varchar('credit_note_number', { length: 50 }).notNull(),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  invoiceId: uuid('invoice_id').references(() => salesInvoices.id),
  issueDate: date('issue_date').notNull(),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  reason: text('reason').notNull(),
  status: creditNoteStatusEnum('status').notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
