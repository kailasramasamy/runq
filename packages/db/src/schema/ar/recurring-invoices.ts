import { pgTable, uuid, varchar, integer, date, jsonb, text, timestamp, pgEnum, index, boolean } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { customers } from './customers';

export const recurrenceFrequencyEnum = pgEnum('recurrence_frequency', ['monthly', 'quarterly', 'yearly', 'custom']);
export const recurringStatusEnum = pgEnum('recurring_status', ['active', 'paused', 'completed']);

export const recurringInvoiceTemplates = pgTable(
  'recurring_invoice_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    customerId: uuid('customer_id').notNull().references(() => customers.id),
    frequency: recurrenceFrequencyEnum('frequency').notNull(),
    intervalDays: integer('interval_days'),
    dayOfMonth: integer('day_of_month').notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date'),
    nextRunDate: date('next_run_date').notNull(),
    status: recurringStatusEnum('status').notNull().default('active'),
    items: jsonb('items').notNull(),
    notes: text('notes'),
    autoSend: boolean('auto_send').notNull().default(false),
    lastGeneratedAt: timestamp('last_generated_at', { withTimezone: true }),
    totalGenerated: integer('total_generated').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_rit_tenant_status').on(t.tenantId, t.status),
    index('idx_rit_next_run_date').on(t.nextRunDate),
    index('idx_rit_tenant_customer').on(t.tenantId, t.customerId),
  ],
);
