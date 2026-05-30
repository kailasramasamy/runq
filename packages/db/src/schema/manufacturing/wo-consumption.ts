import {
  pgTable,
  uuid,
  varchar,
  decimal,
  text,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from '../tenant';
import { users } from '../user';
import { items } from '../masters/items';
import { warehouses } from '../inventory/warehouses';
import { workOrders } from './work-orders';
import { bomLines } from './bom-lines';

/**
 * Manufacturing — WO Consumption rows. One row per input draw against a WO.
 *
 * `unit_cost` is the WAC of the source batch read from `stock_on_hand` at
 * consumption time. `stock_txn_id` backlinks to the matching `stock_ledger`
 * row created at the same time (production_out movement).
 *
 * `batch_no` carries the source batch identifier — required when the input
 * item has `trackBatches=true`. String shape matches the rest of inventory
 * (see plan §4.5b).
 *
 * `bom_line_id` is nullable so operators can add ad-hoc consumption (item
 * not in BOM) with a reason note. Variance reports flag these rows.
 */
export const woConsumption = pgTable(
  'wo_consumption',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    woId: uuid('wo_id')
      .notNull()
      .references(() => workOrders.id, { onDelete: 'cascade' }),
    bomLineId: uuid('bom_line_id').references(() => bomLines.id),
    inputItemId: uuid('input_item_id')
      .notNull()
      .references(() => items.id),
    batchNo: varchar('batch_no', { length: 60 }),
    warehouseId: uuid('warehouse_id')
      .notNull()
      .references(() => warehouses.id),

    qty: decimal('qty', { precision: 12, scale: 3 }).notNull(),
    uom: varchar('uom', { length: 20 }).notNull(),
    unitCost: decimal('unit_cost', { precision: 15, scale: 4 }).notNull(),
    value: decimal('value', { precision: 15, scale: 2 }).notNull(),

    consumedAt: timestamp('consumed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    consumedBy: uuid('consumed_by').references(() => users.id),
    stockTxnId: uuid('stock_txn_id'),

    notes: text('notes'),
    /** Client-generated UUID (mobile offline-queue replay dedupe). NULL for
     * pre-2.5 callers; tenant-scoped partial unique index. */
    idempotencyKey: varchar('idempotency_key', { length: 64 }),
  },
  (t) => [
    index('idx_wo_cons_wo').on(t.woId),
    index('idx_wo_cons_tenant').on(t.tenantId),
    index('idx_wo_cons_item').on(t.inputItemId),
    index('idx_wo_cons_batch')
      .on(t.batchNo)
      .where(sql`${t.batchNo} IS NOT NULL`),
    uniqueIndex('uq_wo_cons_idempotency')
      .on(t.tenantId, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} IS NOT NULL`),
  ],
);

export type WoConsumptionRow = typeof woConsumption.$inferSelect;
export type NewWoConsumptionRow = typeof woConsumption.$inferInsert;
