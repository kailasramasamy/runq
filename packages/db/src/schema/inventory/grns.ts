import {
  pgTable, uuid, varchar, decimal, date, text, timestamp, pgEnum, index, uniqueIndex, jsonb,
} from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { vendors } from '../ap/vendors';
import { items } from '../masters/items';
import { warehouses } from './warehouses';

export const inventoryGrnStatusEnum = pgEnum('inventory_grn_status', [
  'draft', 'posted', 'cancelled',
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
    billId: uuid('bill_id'),
    poId: uuid('po_id'),
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
    itemId: uuid('item_id').notNull().references(() => items.id),
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
  },
  (t) => [
    index('idx_inv_grn_lines_grn').on(t.grnId),
    index('idx_inv_grn_lines_item').on(t.tenantId, t.itemId),
  ],
);
