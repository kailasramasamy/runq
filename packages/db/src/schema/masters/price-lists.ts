import { pgTable, uuid, varchar, decimal, timestamp, pgEnum, index, boolean, date } from 'drizzle-orm/pg-core';
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
    rate: decimal('rate', { precision: 15, scale: 2 }).notNull(),
    marginPercent: decimal('margin_percent', { precision: 5, scale: 2 }),
    discountPercent: decimal('discount_percent', { precision: 5, scale: 2 }),
    minQuantity: decimal('min_quantity', { precision: 12, scale: 3 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The (price_list_id, item_id, COALESCE(min_quantity, 0)) unique index that
    // allows multiple qty tiers per item is created in
    // packages/db/migrations/0002_price_list_enhancements.sql — drizzle-kit
    // can't express the COALESCE so we let the SQL migration own it.
    index('idx_price_list_items_item').on(table.itemId),
  ],
);
