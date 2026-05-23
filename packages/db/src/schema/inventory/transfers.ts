import {
  pgTable, uuid, varchar, decimal, text, timestamp, pgEnum, index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { items } from '../masters/items';
import { warehouses } from './warehouses';

export const transferStatusEnum = pgEnum('inv_transfer_status', [
  'draft', 'in_transit', 'received', 'cancelled',
]);

/**
 * Inter-warehouse stock transfer. Two ledger entries on dispatch
 * (transfer_out from source), two on receipt (transfer_in at destination).
 * Between dispatch and receipt, the qty sits in an implicit "in transit"
 * state — visible via a join of `transfers` rows in_transit + their lines.
 */
export const inventoryTransfers = pgTable(
  'inventory_transfers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    transferNo: varchar('transfer_no', { length: 40 }).notNull(),
    fromWarehouseId: uuid('from_warehouse_id').notNull().references(() => warehouses.id),
    toWarehouseId: uuid('to_warehouse_id').notNull().references(() => warehouses.id),
    status: transferStatusEnum('status').notNull().default('draft'),
    vehicleNo: varchar('vehicle_no', { length: 30 }),
    notes: text('notes'),
    totalValue: decimal('total_value', { precision: 18, scale: 2 }).notNull().default('0'),
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
    receivedAt: timestamp('received_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by'),
  },
  (t) => [
    uniqueIndex('uq_inv_transfer_tenant_no').on(t.tenantId, t.transferNo),
    index('idx_inv_transfer_tenant_status').on(t.tenantId, t.status),
  ],
);

export const inventoryTransferLines = pgTable(
  'inventory_transfer_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    transferId: uuid('transfer_id')
      .notNull()
      .references(() => inventoryTransfers.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id').notNull().references(() => items.id),
    batchNo: varchar('batch_no', { length: 60 }),
    qty: decimal('qty', { precision: 18, scale: 3 }).notNull(),
    qtyReceived: decimal('qty_received', { precision: 18, scale: 3 }).notNull().default('0'),
    unitCost: decimal('unit_cost', { precision: 18, scale: 4 }).notNull().default('0'),
    lineTotal: decimal('line_total', { precision: 18, scale: 2 }).notNull().default('0'),
  },
  (t) => [
    index('idx_inv_transfer_lines_transfer').on(t.transferId),
    index('idx_inv_transfer_lines_item').on(t.tenantId, t.itemId),
  ],
);
