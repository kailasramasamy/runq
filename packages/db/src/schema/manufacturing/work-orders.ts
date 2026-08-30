import {
  pgTable,
  uuid,
  varchar,
  date,
  decimal,
  integer,
  text,
  timestamp,
  pgEnum,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { users } from '../user';
import { warehouses } from '../inventory/warehouses';
import { boms } from './boms';

export const woStatusEnum = pgEnum('wo_status', [
  'draft',
  'in_progress',
  'completed',
  'closed',
  'cancelled',
]);

/**
 * How the run reached the system.
 *
 * `planned`     — a manager authored the WO up front, then the floor ran it.
 * `unplanned`   — a technician recorded finished goods after the fact and the
 *                 inputs were backflushed from the BOM (no manager present).
 * `auto_repack` — no person at all: a dispatch line for a late-differentiation
 *                 SKU came up short, so DispatchRepackService backflushed it
 *                 out of the pool item to cover the delivery. Same mechanics
 *                 as `unplanned`, but nobody to ask about it, so the lists
 *                 must not present it as something a technician did.
 */
export const woEntryModeEnum = pgEnum('wo_entry_mode', [
  'planned',
  'unplanned',
  'auto_repack',
]);

export const qcStatusEnum = pgEnum('qc_status', [
  'pending',
  'passed',
  'failed',
  'conditional',
]);

/**
 * Manufacturing Work Order — scheduled production run against a BOM snapshot.
 *
 * Lifecycle: draft → in_progress → completed → closed
 *            (or any pre-close state → cancelled).
 * GL posting fires once at the `close` transition (Phase 2).
 *
 * Denormalised totals (output_qty / consumed_value / output_value /
 * yield_variance) are populated by Phase 2 from wo_consumption / wo_output.
 * Carried on the row from day one so Phase 2 needs no schema migration.
 */
export const workOrders = pgTable(
  'work_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    woNumber: varchar('wo_number', { length: 50 }).notNull(),

    bomId: uuid('bom_id')
      .notNull()
      .references(() => boms.id),
    bomVersion: integer('bom_version').notNull(),

    plannedQty: decimal('planned_qty', { precision: 12, scale: 3 }).notNull(),
    warehouseId: uuid('warehouse_id')
      .notNull()
      .references(() => warehouses.id),
    shift: varchar('shift', { length: 20 }),
    scheduledFor: date('scheduled_for').notNull(),

    status: woStatusEnum('status').notNull().default('draft'),
    entryMode: woEntryModeEnum('entry_mode').notNull().default('planned'),

    /** Dedupe key for the mobile offline queue. An unplanned entry posts as
     * one atomic unit, so it needs a key at the WO level rather than only on
     * the child consumption/output rows. Null for manager-authored WOs. */
    idempotencyKey: varchar('idempotency_key', { length: 64 }),

    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelledReason: text('cancelled_reason'),

    outputQty: decimal('output_qty', { precision: 12, scale: 3 })
      .notNull()
      .default('0'),
    consumedValue: decimal('consumed_value', { precision: 15, scale: 2 })
      .notNull()
      .default('0'),
    outputValue: decimal('output_value', { precision: 15, scale: 2 })
      .notNull()
      .default('0'),
    yieldVariance: decimal('yield_variance', { precision: 15, scale: 2 })
      .notNull()
      .default('0'),

    qcStatus: qcStatusEnum('qc_status').default('pending'),
    jeId: uuid('je_id'),

    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_wo_tenant_number').on(t.tenantId, t.woNumber),
    index('idx_wo_tenant_status').on(t.tenantId, t.status),
    index('idx_wo_tenant_bom').on(t.tenantId, t.bomId),
    index('idx_wo_tenant_scheduled').on(t.tenantId, t.scheduledFor),
    index('idx_wo_tenant_warehouse').on(t.tenantId, t.warehouseId),
    index('idx_wo_tenant_entry_mode').on(t.tenantId, t.entryMode),
    uniqueIndex('uq_wo_tenant_idempotency').on(t.tenantId, t.idempotencyKey),
  ],
);

export type WorkOrderRow = typeof workOrders.$inferSelect;
export type NewWorkOrderRow = typeof workOrders.$inferInsert;
