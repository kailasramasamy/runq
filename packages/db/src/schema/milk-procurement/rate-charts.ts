import {
  pgTable, uuid, varchar, boolean, decimal, date, timestamp, index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from '../tenant';
import { mpMilkType, mpPricingMode, mpGrade, mpRateRule, mpPricingFamily, mpRateScope } from './enums';
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
  /**
   * Anti-dilution floor: below this SNF a pour prices down the sub-3.5 taper
   * however good its FAT looks. Null = no gate (the default, and every chart
   * predating the 2026-08 A1 chart).
   *
   * Deliberately NOT the `mp_quality_bands` SNF watch floor — that band exists
   * to colour-code quality, and on Vrindavan's own data an 8.00 floor would gate
   * 26% of all litres and 56% of its highest-volume farmer's. A payment gate
   * needs its own, far more conservative number.
   */
  snfGateMin: decimal('snf_gate_min', { precision: 4, scale: 2 }),
  /**
   * SNF printed against every row of a FAT-only chart — the standard we expect,
   * the way KMF's chart is headed "SNF 8.5%". Display only: cells sit at SNF 0
   * so pricing keys on FAT alone, and nothing here is ever read by resolveRate.
   * Enforcement, if any, is `snfGateMin`.
   */
  referenceSnf: decimal('reference_snf', { precision: 4, scale: 2 }),
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
 * Which chart prices a given (scope, milk type, reading axis). One row per slot;
 * most specific scope wins at pour time:
 *
 *   farmer → VMCC → its parent CC → tenant default
 *
 * Charts stay independent of who uses them — this table is the only binding, so
 * a chart can serve many scopes and a scope can hold one chart per milk type
 * per family. Inheritance is resolved at read time, never copied down: changing
 * a tenant default moves every scope that hasn't explicitly overridden it.
 *
 * `tenant` rows carry scopeId = tenantId (not null) so the unique index needs no
 * expression — drizzle-kit push can't apply those.
 */
export const mpRateChartAssignments = pgTable('mp_rate_chart_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  scopeType: mpRateScope('scope_type').notNull(),
  /** tenant → tenantId · node → mp_nodes.id · farmer → mp_farmers.id */
  scopeId: uuid('scope_id').notNull(),
  /** Denormalised from the chart so the slot is unique at the DB level. */
  milkType: mpMilkType('milk_type').notNull(),
  pricingFamily: mpPricingFamily('pricing_family').notNull(),
  rateChartId: uuid('rate_chart_id').notNull().references(() => mpRateCharts.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('uq_mp_rate_assign')
    .on(t.tenantId, t.scopeType, t.scopeId, t.milkType, t.pricingFamily),
  index('idx_mp_rate_assign_scope').on(t.tenantId, t.scopeType, t.scopeId),
  index('idx_mp_rate_assign_chart').on(t.tenantId, t.rateChartId),
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

/**
 * Quality bonus (per grade), volume slabs (per cycle volume) and the quarterly
 * FAT bonus.
 *
 * The first two are per-pour: `bonusFor()` adds them at capture and they land
 * inside `line_amount`. `quarterly_fat_bonus` is NOT — its tier is resolved at
 * quarter close from the farmer's best-two-of-three monthly weighted-average
 * FAT (`fat_min` is the tier floor) and paid as a separate lump sum. Anything
 * pricing a pour must skip it, or the bonus is paid twice.
 */
export const mpRateChartRules = pgTable('mp_rate_chart_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  rateChartId: uuid('rate_chart_id').notNull().references(() => mpRateCharts.id),
  ruleType: mpRateRule('rule_type').notNull(),
  grade: mpGrade('grade'),
  minQty: decimal('min_qty', { precision: 12, scale: 3 }),
  maxQty: decimal('max_qty', { precision: 12, scale: 3 }),
  /** Tier floor for `quarterly_fat_bonus`; null for the per-pour rule types. */
  fatMin: decimal('fat_min', { precision: 4, scale: 2 }),
  bonusPerLitre: decimal('bonus_per_litre', { precision: 8, scale: 2 }).notNull(),
}, (t) => [
  index('idx_mp_rate_rules_chart').on(t.tenantId, t.rateChartId),
]);

export type MpRateChartRow = typeof mpRateCharts.$inferSelect;
export type NewMpRateChartRow = typeof mpRateCharts.$inferInsert;
export type MpRateChartAssignmentRow = typeof mpRateChartAssignments.$inferSelect;

/** A chart's slot: matrix and flat both price off fat/SNF, so they compete. */
export function pricingFamilyOf(mode: 'matrix' | 'flat' | 'clr'): 'fat_snf' | 'clr' {
  return mode === 'clr' ? 'clr' : 'fat_snf';
}
