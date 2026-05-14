import {
  pgTable, uuid, varchar, date, boolean, timestamp,
  pgEnum, index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';

export const holidayTypeEnum = pgEnum('holiday_type', [
  'national', 'state', 'company', 'optional',
]);

export const holidays = pgTable('holidays', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  name: varchar('name', { length: 100 }).notNull(),
  date: date('date').notNull(),
  type: holidayTypeEnum('type').notNull().default('company'),
  state: varchar('state', { length: 50 }),
  isPaid: boolean('is_paid').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_hol_tenant_date').on(t.tenantId, t.date),
  uniqueIndex('uq_hol_tenant_date_name').on(t.tenantId, t.date, t.name),
]);
