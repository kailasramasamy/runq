import { pgTable, uuid, varchar, text, date, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { salesInvoices } from './invoices';
import { users } from '../user';

export const collectionStatusEnum = pgEnum('collection_status', [
  'open',
  'contacted',
  'promised',
  'resolved',
  'escalated',
]);

export const collectionAssignments = pgTable('collection_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  invoiceId: uuid('invoice_id').notNull().references(() => salesInvoices.id),
  assignedTo: uuid('assigned_to').notNull().references(() => users.id),
  assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
  status: collectionStatusEnum('status').notNull().default('open'),
  notes: text('notes'),
  followUpDate: date('follow_up_date'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
