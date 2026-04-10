import { pgTable, uuid, varchar, decimal, timestamp, pgEnum, index, uniqueIndex, boolean, date } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { items } from './items';
import { customers } from '../ar/customers';
import { vendors } from '../ap/vendors';

export const priceListTypeEnum = pgEnum('price_list_type', ['selling', 'buying']);

export const priceListApplyToEnum = pgEnum('price_list_apply_to', [
  'all',
  'customer_group',
  'vendor_group',
  'customer',
  'vendor',
]);

export const priceLists = pgTable(
  'price_lists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: varchar('name', { length: 255 }).notNull(),
    type: priceListTypeEnum('type').notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('INR'),
    applyTo: priceListApplyToEnum('apply_to').notNull().default('all'),
    applyToValue: varchar('apply_to_value', { length: 255 }),
    customerId: uuid('customer_id').references(() => customers.id),
    vendorId: uuid('vendor_id').references(() => vendors.id),
    validFrom: date('valid_from'),
    validTo: date('valid_to'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_price_lists_tenant_active').on(table.tenantId, table.isActive),
    index('idx_price_lists_tenant_type').on(table.tenantId, table.type),
  ],
);

export const priceListItems = pgTable(
  'price_list_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    priceListId: uuid('price_list_id')
      .notNull()
      .references(() => priceLists.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id),
    // Nullable: a line can express *only* a margin% (rate is derived from
    // items.cost_price at resolve time) or *only* an mrp override. Migration
    // 0014 adds a CHECK that at least one of (rate, margin_percent, mrp) is set.
    rate: decimal('rate', { precision: 15, scale: 2 }),
    marginPercent: decimal('margin_percent', { precision: 5, scale: 2 }),
    mrp: decimal('mrp', { precision: 15, scale: 2 }),
    discountPercent: decimal('discount_percent', { precision: 5, scale: 2 }),
    minQuantity: decimal('min_quantity', { precision: 12, scale: 3 }).notNull().default('0'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_price_list_items_item').on(table.itemId),
    // The base tier sits at min_quantity = 0; additional tiers use positive
    // quantities. Migration 0008 enforces NOT NULL DEFAULT 0 so this plain
    // column index works (the prior COALESCE expression index broke
    // drizzle-kit push introspection).
    uniqueIndex('uq_price_list_items_list_item_qty').on(
      table.priceListId,
      table.itemId,
      table.minQuantity,
    ),
  ],
);
