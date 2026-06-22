import {
  pgTable, uuid, varchar, decimal, date, timestamp, index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from '../tenant';
import { users } from '../user';
import { mpFarmers } from './farmers';
import { mpNodes } from './nodes';
import { mpRateCharts } from './rate-charts';
import { mpShift, mpMilkType, mpGrade, mpCaptureSrc, mpPourStatus } from './enums';

/**
 * Farmer pour ledger — the finest-grain, most-written table. Append-only:
 * never UPDATE a posted row; corrections insert a `reversed`-status row whose
 * `reversal_of` points at the original (mirrors stock_ledger). The resolved
 * rate is snapshotted onto `rate_per_litre` so the statement is immutable.
 */
export const mpPours = pgTable('mp_pours', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  nodeId: uuid('node_id').notNull().references(() => mpNodes.id),
  farmerId: uuid('farmer_id').notNull().references(() => mpFarmers.id),
  collectionDate: date('collection_date').notNull(),
  shift: mpShift('shift').notNull(),
  milkType: mpMilkType('milk_type').notNull(),
  qtyLitres: decimal('qty_litres', { precision: 12, scale: 3 }).notNull(),
  fat: decimal('fat', { precision: 5, scale: 2 }),
  snf: decimal('snf', { precision: 5, scale: 2 }),
  clr: decimal('clr', { precision: 5, scale: 2 }),
  water: decimal('water', { precision: 5, scale: 2 }),
  tempC: decimal('temp_c', { precision: 4, scale: 1 }),
  qualityGrade: mpGrade('quality_grade'),
  rateChartId: uuid('rate_chart_id').references(() => mpRateCharts.id),
  ratePerLitre: decimal('rate_per_litre', { precision: 8, scale: 2 }).notNull(),
  baseAmount: decimal('base_amount', { precision: 15, scale: 2 }).notNull().default('0'),
  bonusAmount: decimal('bonus_amount', { precision: 15, scale: 2 }).notNull().default('0'),
  lineAmount: decimal('line_amount', { precision: 15, scale: 2 }).notNull().default('0'),
  // §8.1 future-proofing — manual entry only in v1
  captureSource: mpCaptureSrc('capture_source').notNull().default('manual'),
  // §8.2 — stable receipt id (digital now, printable later)
  receiptNo: varchar('receipt_no', { length: 40 }),
  status: mpPourStatus('status').notNull().default('recorded'),
  // self-reference (correction rows); FK declared in SQL migration
  reversalOf: uuid('reversal_of'),
  // offline-queue replay dedupe (mobile capture)
  deviceLocalId: varchar('device_local_id', { length: 64 }),
  recordedBy: uuid('recorded_by').references(() => users.id),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  syncedAt: timestamp('synced_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_mp_pours_node_date_shift').on(t.tenantId, t.nodeId, t.collectionDate, t.shift),
  index('idx_mp_pours_farmer_date').on(t.tenantId, t.farmerId, t.collectionDate),
  uniqueIndex('uq_mp_pours_device')
    .on(t.tenantId, t.nodeId, t.deviceLocalId)
    .where(sql`${t.deviceLocalId} IS NOT NULL`),
  // No one-per-slot unique guard: a farmer may have several recorded pours per
  // shift (multiple cans, or cow + buffalo). Replace-vs-add is an explicit
  // operator choice (RecordPourInput.asNewLot); same-slot replacement is
  // milk-type-scoped in the service.
]);

export type MpPourRow = typeof mpPours.$inferSelect;
export type NewMpPourRow = typeof mpPours.$inferInsert;
