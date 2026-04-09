import { pgTable, uuid, varchar, decimal, timestamp, pgEnum, index, uniqueIndex, boolean, text, integer, jsonb } from 'drizzle-orm/pg-core';
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
    defaultSellingPrice: decimal('default_selling_price', { precision: 15, scale: 2 }),
    defaultPurchasePrice: decimal('default_purchase_price', { precision: 15, scale: 2 }),
    gstRate: decimal('gst_rate', { precision: 5, scale: 2 }),
    mrp: decimal('mrp', { precision: 15, scale: 2 }),
    costPrice: decimal('cost_price', { precision: 15, scale: 2 }),
    category: varchar('category', { length: 50 }),
    subcategory: varchar('subcategory', { length: 50 }),
    description: text('description'),
    // Extended attributes for supplier catalogue ingestion (added 0009).
    ean: varchar('ean', { length: 20 }),
    margin: decimal('margin', { precision: 5, scale: 2 }),
    brand: varchar('brand', { length: 100 }),
    grammage: varchar('grammage', { length: 50 }),
    packingType: varchar('packing_type', { length: 50 }),
    basicPrice: decimal('basic_price', { precision: 15, scale: 2 }),
    gstValue: decimal('gst_value', { precision: 15, scale: 2 }),
    shelfLifeDays: integer('shelf_life_days'),
    rtvAllowed: boolean('rtv_allowed'),
    vendorPackSize: varchar('vendor_pack_size', { length: 50 }),
    packagingDimension: varchar('packaging_dimension', { length: 100 }),
    temperature: varchar('temperature', { length: 20 }),
    cutoffTime: varchar('cutoff_time', { length: 20 }),
    productType: varchar('product_type', { length: 50 }),
    // Flexible industry-specific attributes. Shape: { [key: string]: string | number | boolean }.
    // Populated from the tenant's itemAttributeSchema (seeded from their
    // industry preset at signup). For FMCG tenants the service layer
    // dual-writes a few keys into the legacy dedicated columns above.
    attributes: jsonb('attributes').$type<Record<string, unknown>>(),
    // Per-item COGM build-up: array of { label, amount, note }. The sum is
    // mirrored into cost_price so existing reads remain accurate.
    cogmBreakdown: jsonb('cogm_breakdown').$type<Array<{ label: string; amount: number; note?: string }>>(),
    isActive: boolean('is_active').notNull().default(true),
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
  ],
);
