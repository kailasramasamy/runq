import { pgTable, uuid, varchar, date, decimal, text, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { purchaseOrders, purchaseOrderItems } from './purchase-orders';

export const grnStatusEnum = pgEnum('grn_status', ['draft', 'confirmed', 'cancelled']);

export const goodsReceiptNotes = pgTable('goods_receipt_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  grnNumber: varchar('grn_number', { length: 50 }).notNull(),
  poId: uuid('po_id').notNull().references(() => purchaseOrders.id),
  receivedDate: date('received_date').notNull(),
  status: grnStatusEnum('status').notNull().default('confirmed'),
  notes: text('notes'),
  wmsGrnId: varchar('wms_grn_id', { length: 100 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const grnItems = pgTable('grn_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  grnId: uuid('grn_id').notNull().references(() => goodsReceiptNotes.id),
  poItemId: uuid('po_item_id').references(() => purchaseOrderItems.id),
  itemName: varchar('item_name', { length: 255 }).notNull(),
  sku: varchar('sku', { length: 100 }),
  orderedQuantity: decimal('ordered_quantity', { precision: 12, scale: 3 }).notNull(),
  receivedQuantity: decimal('received_quantity', { precision: 12, scale: 3 }).notNull(),
  acceptedQuantity: decimal('accepted_quantity', { precision: 12, scale: 3 }).notNull(),
  rejectedQuantity: decimal('rejected_quantity', { precision: 12, scale: 3 }).notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
