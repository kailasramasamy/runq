import { pgTable, uuid, varchar, decimal, timestamp, pgEnum, index, uniqueIndex, boolean, text } from 'drizzle-orm/pg-core';
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
    category: varchar('category', { length: 50 }),
    description: text('description'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_items_tenant_active').on(table.tenantId, table.isActive),
    uniqueIndex('uq_items_tenant_sku')
      .on(table.tenantId, table.sku)
      .where(sql`${table.sku} IS NOT NULL`),
  ],
);
