import { pgTable, uuid, varchar, boolean, text, jsonb, timestamp, unique, index } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';

export const integrations = pgTable('integrations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  provider: varchar('provider', { length: 50 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  config: jsonb('config').notNull().default({}),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique().on(t.tenantId, t.provider),
]);

export const integrationLogs = pgTable('integration_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  integrationId: uuid('integration_id').notNull().references(() => integrations.id),
  action: varchar('action', { length: 100 }).notNull(),
  status: varchar('status', { length: 20 }).notNull(),
  message: text('message'),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index().on(t.tenantId, t.integrationId),
]);
