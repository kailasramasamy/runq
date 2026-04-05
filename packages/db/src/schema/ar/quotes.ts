import { pgTable, uuid, varchar, text, decimal, timestamp, pgEnum, index, date } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { customers } from './customers';

export const quoteStatusEnum = pgEnum('quote_status', [
  'draft', 'sent', 'accepted', 'rejected', 'expired', 'converted',
]);

export const salesQuotes = pgTable('sales_quotes', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  quoteNumber: varchar('quote_number', { length: 50 }).notNull(),
  quoteDate: date('quote_date').notNull(),
  expiryDate: date('expiry_date'),
  subtotal: decimal('subtotal', { precision: 15, scale: 2 }).notNull().default('0'),
  taxAmount: decimal('tax_amount', { precision: 15, scale: 2 }).notNull().default('0'),
  totalAmount: decimal('total_amount', { precision: 15, scale: 2 }).notNull().default('0'),
  status: quoteStatusEnum('status').notNull().default('draft'),
  notes: text('notes'),
  terms: text('terms'),
  convertedToInvoiceId: uuid('converted_to_invoice_id'),
  convertedToOrderId: uuid('converted_to_order_id'),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_sq_tenant_status').on(t.tenantId, t.status),
  index('idx_sq_tenant_customer').on(t.tenantId, t.customerId),
]);

export const salesQuoteItems = pgTable('sales_quote_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  quoteId: uuid('quote_id').notNull().references(() => salesQuotes.id, { onDelete: 'cascade' }),
  itemId: uuid('item_id'),
  description: varchar('description', { length: 500 }).notNull(),
  hsnSacCode: varchar('hsn_sac_code', { length: 8 }),
  quantity: decimal('quantity', { precision: 12, scale: 3 }).notNull(),
  unitPrice: decimal('unit_price', { precision: 15, scale: 2 }).notNull(),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  taxRate: decimal('tax_rate', { precision: 5, scale: 2 }),
  taxAmount: decimal('tax_amount', { precision: 15, scale: 2 }).notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_sqi_tenant_quote').on(t.tenantId, t.quoteId),
]);
