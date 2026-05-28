import {
  pgTable, uuid, varchar, decimal, date, text, timestamp, pgEnum, index, uniqueIndex, jsonb, boolean,
} from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { vendors } from '../ap/vendors';
import { purchaseInvoices } from '../ap/purchase-invoices';
import { vendorCatalogItems } from '../ap/vendor-catalog-items';
import { purchaseOrdersV2, purchaseOrderLinesV2 } from '../purchase/purchase-orders';
import { items } from '../masters/items';
import { warehouses } from './warehouses';

export const inventoryGrnStatusEnum = pgEnum('inventory_grn_status', [
  'draft', 'posted', 'cancelled',
]);

/**
 * AP Pattern-B (migration 0114): discriminates GRN origin so the
 * CHECK constraint can enforce po_id / bill_id consistency.
 *   - 'po'     → linked to a PO; po_id required, bill_id null
 *   - 'bill'   → inline-created from a bill; bill_id required, po_id null
 *   - 'direct' → standalone (opening stock, milk memo, etc.); both null
 */
export const inventoryGrnSourceEnum = pgEnum('inventory_grn_source', [
  'po', 'bill', 'direct',
  // PP Phase 5: scan-vendor-invoice-on-receive. po_id AND bill_id both set,
  // single combined Dr Inventory / Cr AP-Vendor JE (no GRNI gap).
  'po_with_bill',
]);

/**
 * Inventory GRN. Distinct from `goods_receipt_notes` (the AP/PO 3-way-match
 * receipt) because inventory receipts often happen without a PO — direct
 * vendor purchases, openings, returns from production, etc. Linkage to a
 * bill is optional and set after the fact via /grn/:id/link-bill.
 */
export const inventoryGrns = pgTable(
  'inventory_grns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    grnNo: varchar('grn_no', { length: 40 }).notNull(),
    warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id),
    vendorId: uuid('vendor_id').references(() => vendors.id),
    // AP Pattern-B: bill linkage now has a real FK (migration 0114).
    billId: uuid('bill_id').references(() => purchaseInvoices.id),
    // PP Phase 2: FK to purchase_orders_v2 (migration 0118).
    poId: uuid('po_id').references(() => purchaseOrdersV2.id),
    // AP Pattern-B: discriminator + CHECK enforce that exactly one of
    // (po_id, bill_id) matches `source`. Existing rows backfilled by 0114.
    source: inventoryGrnSourceEnum('source').notNull().default('direct'),
    receivedDate: date('received_date').notNull(),
    vehicleNo: varchar('vehicle_no', { length: 30 }),
    lrNo: varchar('lr_no', { length: 40 }),
    notes: text('notes'),
    status: inventoryGrnStatusEnum('status').notNull().default('draft'),
    totalValue: decimal('total_value', { precision: 18, scale: 2 }).notNull().default('0'),
    journalEntryId: uuid('journal_entry_id'),
    cancelledJournalEntryId: uuid('cancelled_journal_entry_id'),
    postedAt: timestamp('posted_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by'),
  },
  (t) => [
    uniqueIndex('uq_inv_grn_tenant_no').on(t.tenantId, t.grnNo),
    index('idx_inv_grn_tenant_status').on(t.tenantId, t.status),
    index('idx_inv_grn_tenant_wh').on(t.tenantId, t.warehouseId),
  ],
);

export const inventoryGrnLines = pgTable(
  'inventory_grn_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    grnId: uuid('grn_id').notNull().references(() => inventoryGrns.id, { onDelete: 'cascade' }),
    // PP catalog-receive (migration 0120): exactly one of (item_id, catalog_item_id)
    // is set, enforced by inv_grn_lines_item_or_catalog CHECK. Direct receipts
    // + bill-inline GRNs write item_id; PO receives write catalog_item_id and
    // only populate item_id when the catalog row has an inventory bridge.
    itemId: uuid('item_id').references(() => items.id),
    catalogItemId: uuid('catalog_item_id').references(() => vendorCatalogItems.id),
    batchNo: varchar('batch_no', { length: 60 }),
    mfgDate: date('mfg_date'),
    expiryDate: date('expiry_date'),
    qty: decimal('qty', { precision: 18, scale: 3 }).notNull(),
    uom: varchar('uom', { length: 20 }),
    unitRate: decimal('unit_rate', { precision: 18, scale: 4 }).notNull(),
    landedCostPerUnit: decimal('landed_cost_per_unit', { precision: 18, scale: 4 }).notNull().default('0'),
    lineTotal: decimal('line_total', { precision: 18, scale: 2 }).notNull(),
    notes: text('notes'),
    // For trackSerials items: array of serial numbers captured at scan
    // time. Inserted into inventory_serials on GRN post. Length must
    // equal qty (enforced at API validation layer).
    serialNos: jsonb('serial_nos').$type<string[]>(),
    // PP Phase 2 (migration 0118): when receiving against a PO, this links
    // the GRN line back to the specific PO line it fulfils. Drives the
    // qty_received counter + PO status auto-transition.
    poLineId: uuid('po_line_id').references(() => purchaseOrderLinesV2.id),
    // PP Phase 5: variance snapshot from scan-on-receive. po_unit_rate and
    // po_qty_ordered are captured at receive time (NULL for non-PO GRNs and
    // off-PO lines). is_off_po flags vendor lines with no matching PO line.
    isOffPo: boolean('is_off_po').notNull().default(false),
    poUnitRate: decimal('po_unit_rate', { precision: 18, scale: 2 }),
    poQtyOrdered: decimal('po_qty_ordered', { precision: 18, scale: 3 }),
  },
  (t) => [
    index('idx_inv_grn_lines_grn').on(t.grnId),
    index('idx_inv_grn_lines_item').on(t.tenantId, t.itemId),
    index('idx_inv_grn_lines_catalog').on(t.tenantId, t.catalogItemId),
  ],
);
