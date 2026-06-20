import {
  pgTable, uuid, varchar, boolean, decimal, date, timestamp, index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from '../tenant';
import { mpMilkType, mpPricingMode, mpGrade, mpRateRule } from './enums';
import { mpNodes } from './nodes';

/**
 * Rate chart header — effective-dated, scoped. Pricing is `matrix` (FAT×SNF
 * cells), `flat` (single per-litre), or `clr` (1-D CLR→₹/L breakpoint table for
 * lactometer-only VMCCs). Bonuses/slabs apply on top of any mode.
 */
export const mpRateCharts = pgTable('mp_rate_charts', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  name: varchar('name', { length: 120 }).notNull(),
  // null = tenant-wide; else scoped to a society/tier node
  scopeNodeId: uuid('scope_node_id').references(() => mpNodes.id),
  milkType: mpMilkType('milk_type').notNull(),
  pricingMode: mpPricingMode('pricing_mode').notNull().default('matrix'),
  flatRatePerLitre: decimal('flat_rate_per_litre', { precision: 8, scale: 2 }),
  season: varchar('season', { length: 20 }),
  effectiveFrom: date('effective_from').notNull(),
  effectiveTo: date('effective_to'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_mp_rate_charts_type_eff').on(t.tenantId, t.milkType, t.effectiveFrom),
  index('idx_mp_rate_charts_scope').on(t.tenantId, t.scopeNodeId),
]);

/**
 * Rate cells. For `matrix` charts: the FAT × SNF → ₹/L grid (fat/snf set, clr
 * null), nearest-floor on (fat, snf). For `clr` charts: a 1-D CLR → ₹/L table
 * (clr set, fat/snf null), nearest-floor on clr.
 */
export const mpRateChartCells = pgTable('mp_rate_chart_cells', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  rateChartId: uuid('rate_chart_id').notNull().references(() => mpRateCharts.id),
  fat: decimal('fat', { precision: 5, scale: 2 }),
  snf: decimal('snf', { precision: 5, scale: 2 }),
  clr: decimal('clr', { precision: 5, scale: 2 }),
  ratePerLitre: decimal('rate_per_litre', { precision: 8, scale: 2 }).notNull(),
}, (t) => [
  uniqueIndex('uq_mp_rate_cells').on(t.rateChartId, t.fat, t.snf)
    .where(sql`${t.clr} IS NULL`),
  uniqueIndex('uq_mp_rate_cells_clr').on(t.rateChartId, t.clr)
    .where(sql`${t.clr} IS NOT NULL`),
]);

/** Quality bonus (per grade) and volume slabs (per cycle volume). */
export const mpRateChartRules = pgTable('mp_rate_chart_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  rateChartId: uuid('rate_chart_id').notNull().references(() => mpRateCharts.id),
  ruleType: mpRateRule('rule_type').notNull(),
  grade: mpGrade('grade'),
  minQty: decimal('min_qty', { precision: 12, scale: 3 }),
  maxQty: decimal('max_qty', { precision: 12, scale: 3 }),
  bonusPerLitre: decimal('bonus_per_litre', { precision: 8, scale: 2 }).notNull(),
}, (t) => [
  index('idx_mp_rate_rules_chart').on(t.tenantId, t.rateChartId),
]);

export type MpRateChartRow = typeof mpRateCharts.$inferSelect;
export type NewMpRateChartRow = typeof mpRateCharts.$inferInsert;
