import { pgTable, uuid, varchar, boolean, integer, jsonb, timestamp, text, unique, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenant';
import { platformUsers } from './platform';

export const featureFlags = pgTable('feature_flags', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: varchar('key', { length: 80 }).notNull().unique(),
  name: varchar('name', { length: 160 }).notNull(),
  description: text('description'),
  defaultEnabled: boolean('default_enabled').notNull().default(false),
  rolloutPercentage: integer('rollout_percentage').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tenantFeatureFlags = pgTable('tenant_feature_flags', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  flagKey: varchar('flag_key', { length: 80 }).notNull(),
  enabled: boolean('enabled').notNull(),
  overrideReason: text('override_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('tenant_feature_flags_tenant_id_flag_key_key').on(t.tenantId, t.flagKey),
  index('idx_tenant_flags_lookup').on(t.tenantId, t.flagKey),
]);

export const appConfig = pgTable('app_config', {
  key: varchar('key', { length: 80 }).primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid('updated_by').references(() => platformUsers.id),
});
