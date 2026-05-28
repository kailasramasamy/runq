import { pgTable, uuid, varchar, date, decimal, integer, text, timestamp, pgEnum, index, uniqueIndex, boolean } from 'drizzle-orm/pg-core';
import { taxCategoryEnum } from '../ar/invoices';
import { tenants } from '../tenant';
import { vendors } from './vendors';
import { purchaseOrders, purchaseOrderItems } from './purchase-orders';
import { goodsReceiptNotes } from './grns';
import { users } from '../user';
import { billSyncSources } from '../integrations/bill-sync-sources';
import { warehouses } from '../inventory/warehouses';

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
  // GST fields
  placeOfSupply: varchar('place_of_supply', { length: 100 }),
  placeOfSupplyCode: varchar('place_of_supply_code', { length: 2 }),
  isInterState: boolean('is_inter_state'),
  cgstAmount: decimal('cgst_amount', { precision: 15, scale: 2 }).notNull().default('0'),
  sgstAmount: decimal('sgst_amount', { precision: 15, scale: 2 }).notNull().default('0'),
  igstAmount: decimal('igst_amount', { precision: 15, scale: 2 }).notNull().default('0'),
  cessAmount: decimal('cess_amount', { precision: 15, scale: 2 }).notNull().default('0'),
  reverseCharge: boolean('reverse_charge').notNull().default(false),
  // TDS fields
  tdsSection: varchar('tds_section', { length: 20 }),
  tdsAmount: decimal('tds_amount', { precision: 15, scale: 2 }).notNull().default('0'),
  sourceId: uuid('source_id').references(() => billSyncSources.id),
  externalId: varchar('external_id', { length: 255 }),
  externalVersion: integer('external_version').notNull().default(0),
  // ─── AP Pattern-B (migration 0114) ────────────────────────────────────
  // Default warehouse for the items-received sub-form on this bill.
  warehouseId: uuid('warehouse_id').references(() => warehouses.id),
  // "☑ Goods received with this invoice" toggle. When true, the post
  // service inline-creates an inventory_grns row (source='bill') and
  // writes the linked id below.
  goodsReceived: boolean('goods_received').notNull().default(false),
  // FK enforced at DB level by migration 0114 (pi_linked_inventory_grn_fk).
  // Drizzle .references() is intentionally omitted here to avoid a
  // circular import with inventory/grns.ts which references this table.
  linkedInventoryGrnId: uuid('linked_inventory_grn_id'),
  // ─── PP Phase 3 — 3-way match (migration 0119) ────────────────────────
  // FK enforced at DB by pi_matched_po_v2_fk. No Drizzle .references()
  // here for the same circular-import reason as linkedInventoryGrnId.
  matchedPoId: uuid('matched_po_id'),
  matchOverrideReason: text('match_override_reason'),
  matchOverrideBy: uuid('match_override_by').references(() => users.id),
  matchCommittedAt: timestamp('match_committed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_pi_tenant_status').on(t.tenantId, t.status),
  index('idx_pi_tenant_vendor').on(t.tenantId, t.vendorId),
  index('idx_pi_tenant_due_date').on(t.tenantId, t.dueDate),
  uniqueIndex('uq_pi_source_external').on(t.sourceId, t.externalId),
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
  // GST fields per line item
  hsnSacCode: varchar('hsn_sac_code', { length: 8 }),
  taxCategory: taxCategoryEnum('tax_category'),
  taxRate: decimal('tax_rate', { precision: 5, scale: 2 }),
  cgstRate: decimal('cgst_rate', { precision: 5, scale: 2 }).notNull().default('0'),
  cgstAmount: decimal('cgst_amount', { precision: 15, scale: 2 }).notNull().default('0'),
  sgstRate: decimal('sgst_rate', { precision: 5, scale: 2 }).notNull().default('0'),
  sgstAmount: decimal('sgst_amount', { precision: 15, scale: 2 }).notNull().default('0'),
  igstRate: decimal('igst_rate', { precision: 5, scale: 2 }).notNull().default('0'),
  igstAmount: decimal('igst_amount', { precision: 15, scale: 2 }).notNull().default('0'),
  cessRate: decimal('cess_rate', { precision: 5, scale: 2 }).notNull().default('0'),
  cessAmount: decimal('cess_amount', { precision: 15, scale: 2 }).notNull().default('0'),
  // TDS fields per line item
  tdsSection: varchar('tds_section', { length: 20 }),
  tdsRate: decimal('tds_rate', { precision: 5, scale: 2 }),
  tdsAmount: decimal('tds_amount', { precision: 15, scale: 2 }).notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_pii_invoice_id').on(t.invoiceId),
]);
