import { pgTable, uuid, varchar, text, integer, timestamp, unique, index } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { customers } from './customers';

export const customerBuyerAliases = pgTable('customer_buyer_aliases', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  customerId: uuid('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  aliasKind: varchar('alias_kind', { length: 10 }).notNull(), // 'name' | 'gstin'
  aliasText: text('alias_text').notNull(),
  useCount: integer('use_count').notNull().default(1),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('customer_buyer_aliases_tenant_kind_text_uniq').on(t.tenantId, t.aliasKind, t.aliasText),
  index('idx_cba_lookup').on(t.tenantId, t.aliasKind, t.aliasText),
]);
