import { pgTable, uuid, varchar, boolean, jsonb, timestamp, text, unique, index } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';

export const billSyncSources = pgTable('bill_sync_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  slug: varchar('slug', { length: 64 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  apiKeyHash: varchar('api_key_hash', { length: 128 }).notNull(),
  apiKeyPrefix: varchar('api_key_prefix', { length: 16 }).notNull(),
  mode: varchar('mode', { length: 16 }).notNull().default('api'),
  columnMapping: jsonb('column_mapping').notNull().default({}),
  dateFormat: varchar('date_format', { length: 32 }),
  amountFormat: varchar('amount_format', { length: 32 }),
  isActive: boolean('is_active').notNull().default(true),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique().on(t.tenantId, t.slug),
  index('idx_bill_sync_sources_tenant').on(t.tenantId),
]);

export const billSyncLogs = pgTable('bill_sync_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  sourceId: uuid('source_id').notNull().references(() => billSyncSources.id),
  externalId: varchar('external_id', { length: 255 }),
  action: varchar('action', { length: 32 }).notNull(),
  status: varchar('status', { length: 32 }).notNull(),
  billId: uuid('bill_id'),
  message: text('message'),
  payload: jsonb('payload'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_bill_sync_logs_source_created').on(t.sourceId, t.createdAt),
  index('idx_bill_sync_logs_tenant_created').on(t.tenantId, t.createdAt),
]);
