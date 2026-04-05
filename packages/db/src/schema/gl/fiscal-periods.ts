import { pgTable, uuid, varchar, date, timestamp, pgEnum, unique, index } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { users } from '../user';

export const fiscalPeriodStatusEnum = pgEnum('fiscal_period_status', ['open', 'closed', 'locked']);

export const fiscalPeriods = pgTable('fiscal_periods', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  name: varchar('name', { length: 50 }).notNull(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  status: fiscalPeriodStatusEnum('status').notNull().default('open'),
  closedBy: uuid('closed_by').references(() => users.id),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique().on(t.tenantId, t.startDate),
  index().on(t.tenantId, t.status),
]);
