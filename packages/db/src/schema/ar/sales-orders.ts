import { pgTable, uuid, varchar, text, decimal, timestamp, pgEnum, index, date } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { customers } from './customers';
import { salesQuotes } from './quotes';

export const salesOrderStatusEnum = pgEnum('sales_order_status', [
  'draft', 'confirmed', 'partially_invoiced', 'fully_invoiced', 'cancelled',
]);

export const salesOrders = pgTable('sales_orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  orderNumber: varchar('order_number', { length: 50 }).notNull(),
  orderDate: date('order_date').notNull(),
  subtotal: decimal('subtotal', { precision: 15, scale: 2 }).notNull().default('0'),
  taxAmount: decimal('tax_amount', { precision: 15, scale: 2 }).notNull().default('0'),
  totalAmount: decimal('total_amount', { precision: 15, scale: 2 }).notNull().default('0'),
  status: salesOrderStatusEnum('status').notNull().default('draft'),
  notes: text('notes'),
  quoteId: uuid('quote_id').references(() => salesQuotes.id),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_so_tenant_status').on(t.tenantId, t.status),
  index('idx_so_tenant_customer').on(t.tenantId, t.customerId),
]);

export const salesOrderItems = pgTable('sales_order_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  orderId: uuid('order_id').notNull().references(() => salesOrders.id, { onDelete: 'cascade' }),
  itemId: uuid('item_id'),
  description: varchar('description', { length: 500 }).notNull(),
  hsnSacCode: varchar('hsn_sac_code', { length: 8 }),
  quantity: decimal('quantity', { precision: 12, scale: 3 }).notNull(),
  unitPrice: decimal('unit_price', { precision: 15, scale: 2 }).notNull(),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  taxRate: decimal('tax_rate', { precision: 5, scale: 2 }),
  taxAmount: decimal('tax_amount', { precision: 15, scale: 2 }).notNull().default('0'),
  quantityInvoiced: decimal('quantity_invoiced', { precision: 12, scale: 3 }).notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_soi_tenant_order').on(t.tenantId, t.orderId),
]);
