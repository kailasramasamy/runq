import { pgTable, uuid, varchar, decimal, timestamp, pgEnum, index, uniqueIndex, boolean, text, jsonb } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { sql } from 'drizzle-orm';

export const itemTypeEnum = pgEnum('item_type', ['product', 'service']);

export const items = pgTable(
  'items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: varchar('name', { length: 255 }).notNull(),
    sku: varchar('sku', { length: 50 }),
    type: itemTypeEnum('type').notNull(),
    hsnSacCode: varchar('hsn_sac_code', { length: 8 }),
    unit: varchar('unit', { length: 20 }),
    // Pack size used by GSTR-1 HSN summary to normalize variant SKUs
    // (e.g. 100ml, 250ml, 500ml, 1L of the same product) to a canonical
    // UQC. value is expressed in pack_size_uqc units.
    packSizeValue: decimal('pack_size_value', { precision: 12, scale: 4 }).notNull().default('1'),
    packSizeUqc: varchar('pack_size_uqc', { length: 10 }).notNull(),
    defaultSellingPrice: decimal('default_selling_price', { precision: 15, scale: 2 }),
    defaultPurchasePrice: decimal('default_purchase_price', { precision: 15, scale: 2 }),
    gstRate: decimal('gst_rate', { precision: 5, scale: 2 }),
    mrp: decimal('mrp', { precision: 15, scale: 2 }),
    costPrice: decimal('cost_price', { precision: 15, scale: 2 }),
    category: varchar('category', { length: 50 }),
    subcategory: varchar('subcategory', { length: 50 }),
    description: text('description'),
    // Universal extended attributes (supplier catalogue ingestion).
    ean: varchar('ean', { length: 20 }),
    margin: decimal('margin', { precision: 5, scale: 2 }),
    basicPrice: decimal('basic_price', { precision: 15, scale: 2 }),
    gstValue: decimal('gst_value', { precision: 15, scale: 2 }),
    // Flexible industry-specific attributes keyed by the tenant's
    // itemAttributeSchema (seeded from their industry preset). Replaces
    // the ten FMCG-specific columns that used to live here (brand,
    // grammage, packingType, shelfLifeDays, …) and were dropped in
    // migration 0013.
    attributes: jsonb('attributes').$type<Record<string, unknown>>(),
    // Per-item COGM build-up: array of { label, amount, note }. The sum is
    // mirrored into cost_price so existing reads remain accurate.
    cogmBreakdown: jsonb('cogm_breakdown').$type<Array<{ label: string; amount: number; note?: string }>>(),
    isActive: boolean('is_active').notNull().default(true),
    // ─── Inventory tracking (added by migration 0080) ──────────────────
    // `trackInventory=false` makes the item behave like a pure service SKU
    // — no ledger rows, no on-hand cache. Existing rows are backfilled to
    // true for `product` and false for `service` in the migration.
    trackInventory: boolean('track_inventory').notNull().default(true),
    trackBatches: boolean('track_batches').notNull().default(false),
    trackSerials: boolean('track_serials').notNull().default(false),
    trackExpiry: boolean('track_expiry').notNull().default(false),
    allowNegativeStock: boolean('allow_negative_stock').notNull().default(false),
    reorderLevel: decimal('reorder_level', { precision: 18, scale: 3 }),
    reorderQty: decimal('reorder_qty', { precision: 18, scale: 3 }),
    defaultWarehouseId: uuid('default_warehouse_id'),
    barcode: varchar('barcode', { length: 64 }),
    weightKg: decimal('weight_kg', { precision: 10, scale: 3 }),
    shelfLifeDays: decimal('shelf_life_days', { precision: 6, scale: 0 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_items_tenant_active').on(table.tenantId, table.isActive),
    uniqueIndex('uq_items_tenant_sku')
      .on(table.tenantId, table.sku)
      .where(sql`${table.sku} IS NOT NULL`),
    index('idx_items_tenant_ean')
      .on(table.tenantId, table.ean)
      .where(sql`${table.ean} IS NOT NULL`),
    uniqueIndex('uq_items_tenant_barcode')
      .on(table.tenantId, table.barcode)
      .where(sql`${table.barcode} IS NOT NULL`),
  ],
);
