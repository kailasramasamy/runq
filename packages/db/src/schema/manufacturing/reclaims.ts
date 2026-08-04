import {
  pgTable, uuid, varchar, date, decimal, text, timestamp, pgEnum, index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from '../tenant';
import { users } from '../user';
import { items } from '../masters/items';
import { warehouses } from '../inventory/warehouses';

export const reclaimStatusEnum = pgEnum('mfg_reclaim_status', [
  'draft', 'posted', 'cancelled',
]);

/**
 * Manufacturing — Reclaim (teardown of finished goods back to raw material).
 *
 * Unsold packets get cut open and the milk goes back into the pool for paneer
 * or curd. Deliberately NOT modelled as a reverse-BOM work order: a WO
 * conserves cost by construction, so the recovered milk would carry the
 * packaging and processing already spent on the FG, and every product made
 * from it would inherit that inflation.
 *
 * Instead the recovered material enters at raw-material WAC and the shortfall
 * (packaging + process loss) is written off. So on post:
 *
 *   fg_value        = qty out x the FG batch's weighted-average cost
 *   recovered_value = qty in  x the raw material's pooled WAC
 *   loss_value      = fg_value - recovered_value   -> Dr 5104
 *
 * Both stock legs sit on account 1112, so the journal entry carries the loss
 * only — consistent with the zero-net-impact skip in the WO close poster.
 */
export const mfgReclaims = pgTable(
  'mfg_reclaims',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    reclaimNo: varchar('reclaim_no', { length: 40 }).notNull(),
    warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id),
    reclaimDate: date('reclaim_date').notNull(),
    status: reclaimStatusEnum('status').notNull().default('draft'),
    notes: text('notes'),

    fgValue: decimal('fg_value', { precision: 18, scale: 2 }).notNull().default('0'),
    recoveredValue: decimal('recovered_value', { precision: 18, scale: 2 }).notNull().default('0'),
    lossValue: decimal('loss_value', { precision: 18, scale: 2 }).notNull().default('0'),

    journalEntryId: uuid('journal_entry_id'),
    postedAt: timestamp('posted_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),

    /** Dedupe key for the mobile offline queue — a reclaim posts atomically. */
    idempotencyKey: varchar('idempotency_key', { length: 64 }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id),
  },
  (t) => [
    uniqueIndex('uq_mfg_reclaim_tenant_no').on(t.tenantId, t.reclaimNo),
    index('idx_mfg_reclaim_tenant_status').on(t.tenantId, t.status),
    index('idx_mfg_reclaim_tenant_date').on(t.tenantId, t.reclaimDate),
    uniqueIndex('uq_mfg_reclaim_idempotency')
      .on(t.tenantId, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} IS NOT NULL`),
  ],
);

/**
 * One line per (FG batch opened -> raw material batch created).
 *
 * `recovered_qty` is entered, not derived: 100 x 500ml packets rarely give
 * back a clean 50 L. `expiry_date` is required when the recovered item tracks
 * batches — reclaimed milk has already been through the chain and needs a
 * short shelf life so FEFO draws it first.
 */
export const mfgReclaimLines = pgTable(
  'mfg_reclaim_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    reclaimId: uuid('reclaim_id')
      .notNull()
      .references(() => mfgReclaims.id, { onDelete: 'cascade' }),

    fgItemId: uuid('fg_item_id').notNull().references(() => items.id),
    fgBatchNo: varchar('fg_batch_no', { length: 60 }),
    fgQty: decimal('fg_qty', { precision: 18, scale: 3 }).notNull(),
    fgUnitCost: decimal('fg_unit_cost', { precision: 18, scale: 4 }).notNull().default('0'),
    fgValue: decimal('fg_value', { precision: 18, scale: 2 }).notNull().default('0'),

    recoveredItemId: uuid('recovered_item_id').notNull().references(() => items.id),
    recoveredBatchNo: varchar('recovered_batch_no', { length: 60 }),
    recoveredQty: decimal('recovered_qty', { precision: 18, scale: 3 }).notNull(),
    recoveredUnitCost: decimal('recovered_unit_cost', { precision: 18, scale: 4 }).notNull().default('0'),
    recoveredValue: decimal('recovered_value', { precision: 18, scale: 2 }).notNull().default('0'),
    expiryDate: date('expiry_date'),

    /**
     * What the recovered material is earmarked for — paneer, curd. Intent
     * only: it moves no stock and posts no GL, because the product is made
     * later as its own run. Recorded here so the floor's decision survives
     * the shift and reports can show where reclaimed milk went.
     */
    destinationItemId: uuid('destination_item_id').references(() => items.id),

    notes: text('notes'),
  },
  (t) => [
    index('idx_mfg_reclaim_lines_reclaim').on(t.reclaimId),
    index('idx_mfg_reclaim_lines_fg_item').on(t.tenantId, t.fgItemId),
    index('idx_mfg_reclaim_lines_recovered').on(t.tenantId, t.recoveredItemId),
    index('idx_mfg_reclaim_lines_expiry')
      .on(t.expiryDate)
      .where(sql`${t.expiryDate} IS NOT NULL`),
  ],
);

export type MfgReclaimRow = typeof mfgReclaims.$inferSelect;
export type MfgReclaimLineRow = typeof mfgReclaimLines.$inferSelect;
