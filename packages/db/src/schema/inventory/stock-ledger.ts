import {
  pgTable, uuid, varchar, decimal, timestamp, pgEnum, index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { items } from '../masters/items';
import { warehouses } from './warehouses';
import { journalEntries } from '../gl/journal-entries';

export const stockMovementTypeEnum = pgEnum('stock_movement_type', [
  'grn', 'delivery', 'transfer_in', 'transfer_out',
  'adjustment_in', 'adjustment_out', 'opening', 'reversal',
  'stock_take_in', 'stock_take_out',
  // Manufacturing Phase 2:
  //   production_out — WO consumption (RM / packing → WIP)
  //   production_in  — WO output     (WIP → FG)
  'production_out', 'production_in',
  // Goods coming back from a customer against a dispatch, at the original
  // dispatch cost. Distinct from 'reversal' (which unwinds a cancelled doc).
  'sales_return_in',
  // Teardown of unsold finished goods back into raw material — cutting open
  // milk packets to re-use the milk for paneer or curd.
  //   reclaim_out — the FG batch being opened
  //   reclaim_in  — the recovered raw material, at raw-material WAC
  'reclaim_out', 'reclaim_in',
]);

/**
 * Append-only stock ledger. Every movement that changes on-hand quantity
 * inserts exactly one row here. Cancellations are modelled as `reversal`
 * rows pointing back at the original via (source_type, source_id) — the
 * original row is never updated.
 *
 * unit_cost + running_value are denormalised so we can render a moving
 * weighted-average valuation per (item, warehouse) without re-aggregating
 * the entire history on every read.
 */
export const stockLedger = pgTable(
  'stock_ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    itemId: uuid('item_id').notNull().references(() => items.id),
    warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id),
    batchNo: varchar('batch_no', { length: 60 }),
    movementType: stockMovementTypeEnum('movement_type').notNull(),
    sourceType: varchar('source_type', { length: 40 }).notNull(),
    sourceId: uuid('source_id').notNull(),
    sourceLineId: uuid('source_line_id'),
    qtyIn: decimal('qty_in', { precision: 18, scale: 3 }).notNull().default('0'),
    qtyOut: decimal('qty_out', { precision: 18, scale: 3 }).notNull().default('0'),
    unitCost: decimal('unit_cost', { precision: 18, scale: 4 }).notNull().default('0'),
    runningQty: decimal('running_qty', { precision: 18, scale: 3 }).notNull(),
    runningValue: decimal('running_value', { precision: 18, scale: 4 }).notNull(),
    movedAt: timestamp('moved_at', { withTimezone: true }).notNull(),
    postedAt: timestamp('posted_at', { withTimezone: true }).notNull().defaultNow(),
    postedBy: uuid('posted_by'),
    journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id),
  },
  (t) => [
    index('idx_ledger_tenant_item_wh_time')
      .on(t.tenantId, t.itemId, t.warehouseId, t.movedAt),
    index('idx_ledger_tenant_source').on(t.tenantId, t.sourceType, t.sourceId),
    index('idx_ledger_tenant_moved').on(t.tenantId, t.movedAt),
  ],
);

/**
 * Materialised on-hand cache. Updated inside the same transaction as the
 * matching stock_ledger insert. Rebuildable from the ledger via an admin
 * command if it ever drifts.
 *
 * PK is (tenant_id, item_id, warehouse_id, batch_no) — batch_no is empty
 * string '' for items that don't track batches, so the PK stays composable.
 */
export const stockOnHand = pgTable(
  'stock_on_hand',
  {
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    itemId: uuid('item_id').notNull().references(() => items.id),
    warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id),
    batchNo: varchar('batch_no', { length: 60 }).notNull().default(''),
    qty: decimal('qty', { precision: 18, scale: 3 }).notNull().default('0'),
    avgCost: decimal('avg_cost', { precision: 18, scale: 4 }).notNull().default('0'),
    value: decimal('value', { precision: 18, scale: 4 }).notNull().default('0'),
    lastMovementAt: timestamp('last_movement_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('pk_stock_on_hand').on(t.tenantId, t.itemId, t.warehouseId, t.batchNo),
    index('idx_soh_tenant_item').on(t.tenantId, t.itemId),
    index('idx_soh_tenant_wh').on(t.tenantId, t.warehouseId),
  ],
);
