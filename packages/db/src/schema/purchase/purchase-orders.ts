import {
  pgTable, uuid, varchar, date, decimal, integer, text, timestamp, pgEnum, index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { vendors } from '../ap/vendors';
import { users } from '../user';
import { vendorCatalogItems } from '../ap/vendor-catalog-items';

/**
 * PP Phase 1 — Purchase Order tables.
 * Spec: docs/purchase-procurement-plan.md §4.
 *
 * Lives in the `purchase_orders_v2` / `purchase_order_lines_v2` DB tables
 * (name suffix avoids collision with the legacy `ap/purchase-orders.ts`
 * WMS-integration tables which stay for back-compat). Drizzle exports
 * use clean names — call sites import these.
 */

export const purchaseOrderStatusEnumV2 = pgEnum('purchase_order_status', [
  'draft', 'sent', 'partially_received', 'received', 'closed', 'cancelled',
]);

export const purchaseOrdersV2 = pgTable(
  'purchase_orders_v2',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    poNumber: varchar('po_number', { length: 50 }).notNull(),
    vendorId: uuid('vendor_id').notNull().references(() => vendors.id),

    poDate: date('po_date').notNull(),
    expectedDate: date('expected_date'),
    deliveryAddress: text('delivery_address'),
    paymentTerms: varchar('payment_terms', { length: 100 }),
    notes: text('notes'),

    status: purchaseOrderStatusEnumV2('status').notNull().default('draft'),

    /**
     * Source PR linkage — populated in Phase 5 (PR module). Stays
     * nullable forever; PO can exist without a PR.
     */
    sourcePrId: uuid('source_pr_id'),

    subtotal: decimal('subtotal', { precision: 15, scale: 2 }).notNull().default('0'),
    taxTotal: decimal('tax_total', { precision: 15, scale: 2 }).notNull().default('0'),
    total: decimal('total', { precision: 15, scale: 2 }).notNull().default('0'),

    createdBy: uuid('created_by').references(() => users.id),
    approvedBy: uuid('approved_by').references(() => users.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closedReason: text('closed_reason'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_po_v2_tenant_number').on(t.tenantId, t.poNumber),
    index('idx_po_v2_tenant_status').on(t.tenantId, t.status),
    index('idx_po_v2_tenant_vendor').on(t.tenantId, t.vendorId),
    index('idx_po_v2_tenant_po_date').on(t.tenantId, t.poDate),
  ],
);

export const purchaseOrderLinesV2 = pgTable(
  'purchase_order_lines_v2',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    poId: uuid('po_id').notNull().references(() => purchaseOrdersV2.id, { onDelete: 'cascade' }),
    lineNo: integer('line_no').notNull(),

    description: varchar('description', { length: 255 }).notNull(),
    catalogItemId: uuid('catalog_item_id').references(() => vendorCatalogItems.id),
    uom: varchar('uom', { length: 20 }),
    hsnSacCode: varchar('hsn_sac_code', { length: 10 }),

    qtyOrdered: decimal('qty_ordered', { precision: 12, scale: 3 }).notNull(),
    unitRate: decimal('unit_rate', { precision: 15, scale: 2 }).notNull(),
    amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
    taxRate: decimal('tax_rate', { precision: 5, scale: 2 }).default('0'),
    taxAmount: decimal('tax_amount', { precision: 15, scale: 2 }).default('0'),

    /**
     * Denormalised counters — updated by Phase 2 (GRN-from-PO) and the
     * AP bill-match path. Drive PO status transitions (sent →
     * partially_received → received).
     */
    qtyReceived: decimal('qty_received', { precision: 12, scale: 3 }).notNull().default('0'),
    qtyBilled: decimal('qty_billed', { precision: 12, scale: 3 }).notNull().default('0'),

    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_pol_v2_po').on(t.poId),
    index('idx_pol_v2_catalog').on(t.catalogItemId),
  ],
);
