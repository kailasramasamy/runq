import {
  pgTable,
  uuid,
  varchar,
  numeric,
  integer,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { vendors } from './vendors';
import { items } from '../masters/items';
import { users } from '../user';

/**
 * Per-vendor catalog of line-items previously seen on POs or bills from
 * that vendor. Vendor-facing free-text descriptions; their default rate,
 * UOM, HSN, tax. **Not** the items master — items master only holds
 * what the tenant tracks in inventory. The optional `inventoryItemId`
 * bridges the catalog entry to a tracked item when one exists.
 *
 * Populated explicitly by user action (suggest-only — see
 * `docs/ap-pattern-b-spec.md` §4.1). Never silently grown from
 * extraction or bill-line save.
 *
 * Active-row uniqueness on (vendor_id, normalized_description) lets the
 * same description be re-added after deactivation, and prevents two
 * active catalog entries from colliding for the same vendor.
 */
export const vendorCatalogItems = pgTable(
  'vendor_catalog_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    vendorId: uuid('vendor_id').notNull().references(() => vendors.id, { onDelete: 'cascade' }),

    description: varchar('description', { length: 255 }).notNull(),
    normalizedDescription: varchar('normalized_description', { length: 255 }).notNull(),
    defaultUom: varchar('default_uom', { length: 20 }),
    defaultRate: numeric('default_rate', { precision: 15, scale: 2 }),
    hsnSacCode: varchar('hsn_sac_code', { length: 10 }),
    defaultTaxRate: numeric('default_tax_rate', { precision: 5, scale: 2 }),
    defaultTaxCategory: varchar('default_tax_category', { length: 20 }),

    /**
     * Optional FK to items master. Set only for tracked inventory items
     * (e.g. packaging film, raw milk). NULL for services, freight,
     * generic supplies — the dominant case.
     */
    inventoryItemId: uuid('inventory_item_id').references(() => items.id),

    useCount: integer('use_count').notNull().default(0),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    isActive: boolean('is_active').notNull().default(true),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Note: the partial unique index lives in migration 0114 (Drizzle
    // doesn't support `WHERE is_active = true` predicates in uniqueIndex).
    // We declare a regular index here for query performance only.
    index('idx_vci_tenant_vendor').on(t.tenantId, t.vendorId),
    index('idx_vci_inventory_item').on(t.inventoryItemId),
  ],
);

/**
 * Append-only price log for catalog items. One row per rate change.
 * Written on every silent (≤5% drift) update and on user-confirmed
 * (>5%) updates. Lightweight; no FK to source docs beyond a string
 * discriminator + uuid (to avoid cross-table coupling with bills/POs).
 */
export const vendorCatalogItemPriceHistory = pgTable(
  'vendor_catalog_item_price_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    catalogItemId: uuid('catalog_item_id')
      .notNull()
      .references(() => vendorCatalogItems.id, { onDelete: 'cascade' }),
    rate: numeric('rate', { precision: 15, scale: 2 }).notNull(),
    sourceDocType: varchar('source_doc_type', { length: 20 }).notNull(),  // 'po' | 'bill' | 'manual'
    sourceDocId: uuid('source_doc_id'),
    changedBy: uuid('changed_by').references(() => users.id),
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_vci_history_catalog_item').on(t.catalogItemId, t.changedAt),
  ],
);

/**
 * Normalisation rule. MUST be applied server-side before insert/lookup so
 * the partial unique index works and combobox suggestions match
 * reliably. Mirrors the rule used by API service code.
 */
export function normaliseCatalogDescription(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}
