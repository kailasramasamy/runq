import { pgTable, uuid, varchar, boolean, timestamp, unique, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from '../tenant';

/**
 * Machine credentials for outbound partner integrations — a downstream system
 * (4amFresh's consumer backend) reading a narrow, curated slice of one tenant's
 * data. Distinct from `bill_sync_sources`, which authenticates the same way but
 * only ever accepts a push; these keys are read-only and scope-gated.
 *
 * The key is stored hashed; `api_key_prefix` exists so a key can be identified
 * in the UI and rotated without ever displaying the secret again.
 */
export const partnerApiKeys = pgTable('partner_api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  slug: varchar('slug', { length: 64 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  apiKeyHash: varchar('api_key_hash', { length: 128 }).notNull(),
  apiKeyPrefix: varchar('api_key_prefix', { length: 16 }).notNull(),
  /** Grants, e.g. ['mp:milk-quality:read']. Empty grants nothing. */
  scopes: varchar('scopes', { length: 64 }).array().notNull().default(sql`'{}'`),
  isActive: boolean('is_active').notNull().default(true),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique().on(t.tenantId, t.slug),
  index('idx_partner_api_keys_tenant').on(t.tenantId),
]);

export type PartnerApiKeyRow = typeof partnerApiKeys.$inferSelect;
export type NewPartnerApiKeyRow = typeof partnerApiKeys.$inferInsert;
