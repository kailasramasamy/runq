import {
  pgTable, uuid, varchar, decimal, text, timestamp, pgEnum, boolean, index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { items } from '../masters/items';
import { warehouses } from './warehouses';
import { categories } from '../masters/categories';

export const stockTakeScopeEnum = pgEnum('inv_stock_take_scope', ['full', 'partial', 'cycle']);
export const stockTakeStatusEnum = pgEnum('inv_stock_take_status', [
  'in_progress', 'reviewed', 'posted', 'cancelled',
]);

/**
 * Physical count session. While `frozen=true`, any GRN/DN/transfer/
 * adjustment that touches the scope is blocked. Posting creates one
 * consolidated `inventory_adjustments` row with all variance lines plus
 * a single JE.
 */
export const inventoryStockTakes = pgTable(
  'inventory_stock_takes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    stNo: varchar('st_no', { length: 40 }).notNull(),
    warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id),
    scope: stockTakeScopeEnum('scope').notNull().default('full'),
    categoryId: uuid('category_id').references(() => categories.id),
    notes: text('notes'),
    status: stockTakeStatusEnum('status').notNull().default('in_progress'),
    frozen: boolean('frozen').notNull().default(false),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    adjustmentId: uuid('adjustment_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by'),
  },
  (t) => [
    uniqueIndex('uq_inv_st_tenant_no').on(t.tenantId, t.stNo),
    index('idx_inv_st_tenant_status').on(t.tenantId, t.status),
  ],
);

export const inventoryStockTakeLines = pgTable(
  'inventory_stock_take_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    stockTakeId: uuid('stock_take_id')
      .notNull()
      .references(() => inventoryStockTakes.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id').notNull().references(() => items.id),
    batchNo: varchar('batch_no', { length: 60 }),
    systemQty: decimal('system_qty', { precision: 18, scale: 3 }).notNull(),
    countedQty: decimal('counted_qty', { precision: 18, scale: 3 }),
    unitCost: decimal('unit_cost', { precision: 18, scale: 4 }).notNull().default('0'),
    recountFlag: boolean('recount_flag').notNull().default(false),
    countedBy: uuid('counted_by'),
    countedAt: timestamp('counted_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_inv_st_lines_st').on(t.stockTakeId),
    index('idx_inv_st_lines_item').on(t.tenantId, t.itemId),
    uniqueIndex('uq_inv_st_lines_per_batch').on(t.stockTakeId, t.itemId, t.batchNo),
  ],
);
