import {
  pgTable, uuid, decimal, boolean, timestamp, uniqueIndex, index, pgEnum,
} from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { items } from '../masters/items';
import { warehouses } from './warehouses';

export const stockAlertStatusEnum = pgEnum('stock_alert_status', ['ok', 'low', 'out']);

/**
 * Last-known stock-alert status per (item, warehouse).
 *
 * This table exists ONLY for edge detection and notification dedupe. The
 * lists the UI renders are always computed live off `stock_on_hand`, so a
 * stale row here can never show a wrong number to a user — the worst case
 * is a missed or duplicated notification, which the daily sweep repairs.
 *
 * `recordMovement` upserts this row inside the caller's transaction and
 * sets `notify_pending` only when status WORSENS (ok→low, ok→out, low→out).
 * The scheduler drains pending rows out-of-band, so a rolled-back posting
 * can never leave a phantom notification behind.
 */
export const stockAlertState = pgTable(
  'inventory_stock_alert_state',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    itemId: uuid('item_id').notNull().references(() => items.id),
    warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id),
    status: stockAlertStatusEnum('status').notNull().default('ok'),
    /** On-hand at the moment status was last evaluated. */
    onHand: decimal('on_hand', { precision: 18, scale: 3 }).notNull().default('0'),
    /** Effective reorder level used for that evaluation; null when unset. */
    threshold: decimal('threshold', { precision: 18, scale: 3 }),
    statusChangedAt: timestamp('status_changed_at', { withTimezone: true }).notNull().defaultNow(),
    notifyPending: boolean('notify_pending').notNull().default(false),
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_stock_alert_state_item_wh').on(t.tenantId, t.itemId, t.warehouseId),
    // Drives the scheduler drain — tenant-grouped, pending-only.
    index('idx_stock_alert_pending').on(t.tenantId, t.notifyPending),
  ],
);
