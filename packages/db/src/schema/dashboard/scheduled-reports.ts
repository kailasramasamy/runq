import { pgTable, uuid, varchar, text, boolean, jsonb, timestamp, pgEnum, index } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { users } from '../user';

export const reportFrequencyEnum = pgEnum('report_frequency', ['daily', 'weekly', 'monthly']);

export const scheduledReports = pgTable('scheduled_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  name: varchar('name', { length: 100 }).notNull(),
  reportType: varchar('report_type', { length: 50 }).notNull(),
  frequency: reportFrequencyEnum('frequency').notNull(),
  recipients: jsonb('recipients').notNull(),
  config: jsonb('config').notNull().default({}),
  isActive: boolean('is_active').notNull().default(true),
  lastSentAt: timestamp('last_sent_at', { withTimezone: true }),
  nextRunAt: timestamp('next_run_at', { withTimezone: true }),
  lastRunStatus: varchar('last_run_status', { length: 20 }),
  lastError: text('last_error'),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index().on(t.tenantId, t.isActive),
]);
