import {
  pgTable, uuid, decimal, timestamp, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from '../tenant';
import { mpMilkType, mpQualityMetric } from './enums';
import { mpNodes } from './nodes';

/**
 * Configurable good / watch / low thresholds per milk type and metric, used to
 * colour-code FAT/SNF/CLR across Dhenu and to derive the per-pour quality grade.
 *
 * Resolution mirrors rate charts: a row scoped to a node (`node_id` set)
 * overrides the tenant-wide default (`node_id` null) for that (milk_type,
 * metric); when neither exists the service falls back to seeded constants.
 *
 * Band semantics (higher = better within the normal range):
 *   value >= good_min  → Good  (green)
 *   value >= watch_min → Watch (amber)
 *   else               → Low   (red / flagged)
 */
export const mpQualityBands = pgTable('mp_quality_bands', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  // null = tenant-wide default; else scoped to a node (overrides the default)
  nodeId: uuid('node_id').references(() => mpNodes.id),
  milkType: mpMilkType('milk_type').notNull(),
  metric: mpQualityMetric('metric').notNull(),
  goodMin: decimal('good_min', { precision: 5, scale: 2 }).notNull(),
  watchMin: decimal('watch_min', { precision: 5, scale: 2 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('uq_mp_quality_bands_tenant').on(t.tenantId, t.milkType, t.metric)
    .where(sql`${t.nodeId} IS NULL`),
  uniqueIndex('uq_mp_quality_bands_node').on(t.tenantId, t.nodeId, t.milkType, t.metric)
    .where(sql`${t.nodeId} IS NOT NULL`),
]);

export type MpQualityBandRow = typeof mpQualityBands.$inferSelect;
export type NewMpQualityBandRow = typeof mpQualityBands.$inferInsert;
