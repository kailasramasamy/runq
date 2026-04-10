import { pgTable, uuid, varchar, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { customers } from './customers';
import { items } from '../masters/items';

/**
 * Persisted source-name → master ID mappings used by the invoice import
 * feature. When a tenant resolves an unmatched item or customer in the
 * staging UI, the chosen mapping is saved here so the next import that
 * encounters the same source name auto-maps without manual review.
 *
 * The matcher also feeds the source_name column into its fuzzy-match
 * search universe, so a typo'd or differently-formatted source name can
 * still resolve via a previously-confirmed alias.
 *
 * Migration 0015 enforces tenant_id + lower(source_name) uniqueness.
 */
export const invoiceImportItemAliases = pgTable(
  'invoice_import_item_aliases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    sourceName: varchar('source_name', { length: 255 }).notNull(),
    itemId: uuid('item_id').notNull().references(() => items.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The real unique index on lower(source_name) is created by migration
    // 0015 (raw SQL). drizzle-kit push can't represent expression indexes
    // and crashes during introspection if we define one here. We use a
    // plain column index for push compatibility — the migration's
    // expression index is the authoritative constraint.
    index('idx_invoice_import_item_aliases_tenant').on(t.tenantId),
  ],
);

export const invoiceImportCustomerAliases = pgTable(
  'invoice_import_customer_aliases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    sourceKey: varchar('source_key', { length: 255 }).notNull(),
    customerId: uuid('customer_id').notNull().references(() => customers.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // See item aliases above — same rationale for omitting the expression index.
    index('idx_invoice_import_customer_aliases_tenant').on(t.tenantId),
  ],
);
