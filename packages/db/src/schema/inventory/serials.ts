import {
  pgTable, uuid, varchar, timestamp, pgEnum, index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { items } from '../masters/items';
import { warehouses } from './warehouses';

export const serialStatusEnum = pgEnum('inv_serial_status', [
  'in_stock', 'sold', 'returned', 'scrapped', 'in_transit',
]);

/**
 * Per-unit serial tracking. Created on GRN line save (one row per serial),
 * status transitions on DN dispatch / return / scrap. Lookup-by-serial
 * powers warranty / RMA flows.
 *
 * Phase 3 ships the table + lookup endpoints. GRN/DN integration to
 * capture and transition serials arrives in Phase 4 with the mobile
 * scan-driven flows.
 */
export const inventorySerials = pgTable(
  'inventory_serials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    itemId: uuid('item_id').notNull().references(() => items.id),
    serialNo: varchar('serial_no', { length: 80 }).notNull(),
    currentWarehouseId: uuid('current_warehouse_id').references(() => warehouses.id),
    currentStatus: serialStatusEnum('current_status').notNull().default('in_stock'),
    batchNo: varchar('batch_no', { length: 60 }),
    grnId: uuid('grn_id'),
    dnId: uuid('dn_id'),
    notes: varchar('notes', { length: 500 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_inv_serial_tenant_item_no').on(t.tenantId, t.itemId, t.serialNo),
    index('idx_inv_serial_tenant_status').on(t.tenantId, t.currentStatus),
    index('idx_inv_serial_tenant_wh').on(t.tenantId, t.currentWarehouseId),
  ],
);
