import { pgTable, uuid, varchar, date, decimal, text, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { vendors } from './vendors';

export const poStatusEnum = pgEnum('po_status', ['draft', 'confirmed', 'partially_received', 'fully_received', 'cancelled']);

export const purchaseOrders = pgTable('purchase_orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  poNumber: varchar('po_number', { length: 50 }).notNull(),
  vendorId: uuid('vendor_id').notNull().references(() => vendors.id),
  orderDate: date('order_date').notNull(),
  expectedDeliveryDate: date('expected_delivery_date'),
  status: poStatusEnum('status').notNull().default('confirmed'),
  totalAmount: decimal('total_amount', { precision: 15, scale: 2 }).notNull().default('0'),
  notes: text('notes'),
  wmsPoId: varchar('wms_po_id', { length: 100 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const purchaseOrderItems = pgTable('purchase_order_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  poId: uuid('po_id').notNull().references(() => purchaseOrders.id),
  itemName: varchar('item_name', { length: 255 }).notNull(),
  sku: varchar('sku', { length: 100 }),
  quantity: decimal('quantity', { precision: 12, scale: 3 }).notNull(),
  unitPrice: decimal('unit_price', { precision: 15, scale: 2 }).notNull(),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
