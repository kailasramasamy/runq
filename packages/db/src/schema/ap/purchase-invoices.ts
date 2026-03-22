import { pgTable, uuid, varchar, date, decimal, text, timestamp, pgEnum, index } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { vendors } from './vendors';
import { purchaseOrders, purchaseOrderItems } from './purchase-orders';
import { goodsReceiptNotes } from './grns';
import { users } from '../user';

export const purchaseInvoiceStatusEnum = pgEnum('purchase_invoice_status', ['draft', 'pending_match', 'matched', 'approved', 'partially_paid', 'paid', 'cancelled']);
export const matchStatusEnum = pgEnum('match_status', ['unmatched', 'matched', 'mismatch']);

export const purchaseInvoices = pgTable('purchase_invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  invoiceNumber: varchar('invoice_number', { length: 50 }).notNull(),
  vendorId: uuid('vendor_id').notNull().references(() => vendors.id),
  poId: uuid('po_id').references(() => purchaseOrders.id),
  grnId: uuid('grn_id').references(() => goodsReceiptNotes.id),
  invoiceDate: date('invoice_date').notNull(),
  dueDate: date('due_date').notNull(),
  subtotal: decimal('subtotal', { precision: 15, scale: 2 }).notNull(),
  taxAmount: decimal('tax_amount', { precision: 15, scale: 2 }).notNull().default('0'),
  totalAmount: decimal('total_amount', { precision: 15, scale: 2 }).notNull(),
  amountPaid: decimal('amount_paid', { precision: 15, scale: 2 }).notNull().default('0'),
  balanceDue: decimal('balance_due', { precision: 15, scale: 2 }).notNull(),
  status: purchaseInvoiceStatusEnum('status').notNull().default('draft'),
  matchStatus: matchStatusEnum('match_status').notNull().default('unmatched'),
  matchNotes: text('match_notes'),
  approvedBy: uuid('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  wmsInvoiceId: varchar('wms_invoice_id', { length: 100 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_pi_tenant_status').on(t.tenantId, t.status),
  index('idx_pi_tenant_vendor').on(t.tenantId, t.vendorId),
  index('idx_pi_tenant_due_date').on(t.tenantId, t.dueDate),
]);

export const purchaseInvoiceItems = pgTable('purchase_invoice_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  invoiceId: uuid('invoice_id').notNull().references(() => purchaseInvoices.id),
  poItemId: uuid('po_item_id').references(() => purchaseOrderItems.id),
  itemName: varchar('item_name', { length: 255 }).notNull(),
  sku: varchar('sku', { length: 100 }),
  quantity: decimal('quantity', { precision: 12, scale: 3 }).notNull(),
  unitPrice: decimal('unit_price', { precision: 15, scale: 2 }).notNull(),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
