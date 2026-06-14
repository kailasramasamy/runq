import { and, eq, desc, sql, lte, gte, isNull, or } from 'drizzle-orm';
import { mpRateCharts, mpRateChartCells, mpRateChartRules } from '@runq/db';
import type { Db, MpRateChartRow } from '@runq/db';
import { applyPagination, calcTotalPages } from '@runq/db';
import type { PaginationMeta } from '@runq/types';
import type { CreateRateChartInput, RateChartFilter, ResolveRateInput } from '@runq/validators';
import { NotFoundError } from '../../utils/errors';

type Cell = typeof mpRateChartCells.$inferSelect;
type Rule = typeof mpRateChartRules.$inferSelect;
type Grade = 'a' | 'b' | 'c';

export interface RateChartDetail extends MpRateChartRow {
  cells: Cell[];
  rules: Rule[];
}

export interface RateResolution {
  rateChartId: string;
  baseRatePerLitre: number;
  bonusPerLitre: number;
  ratePerLitre: number;
  grade: Grade;
}

/** Rate charts (matrix/flat) + the per-pour rate resolution used by A3. */
export class RateChartService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async list(
    filters: RateChartFilter,
    pagination: { page: number; limit: number },
  ): Promise<{ data: MpRateChartRow[]; meta: PaginationMeta }> {
    const { page, limit } = pagination;
    const { offset } = applyPagination(page, limit);
    const where = this.buildWhere(filters);
    const [rows, countResult] = await Promise.all([
      this.db.select().from(mpRateCharts).where(where)
        .orderBy(desc(mpRateCharts.effectiveFrom)).limit(limit).offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(mpRateCharts).where(where),
    ]);
    const total = countResult[0]?.count ?? 0;
    return { data: rows, meta: { page, limit, total, totalPages: calcTotalPages(total, limit) } };
  }

  async getById(id: string): Promise<RateChartDetail> {
    const [chart] = await this.db.select().from(mpRateCharts)
      .where(and(eq(mpRateCharts.tenantId, this.tenantId), eq(mpRateCharts.id, id)));
    if (!chart) throw new NotFoundError('Rate chart not found');
    const [cells, rules] = await Promise.all([
      this.db.select().from(mpRateChartCells)
        .where(eq(mpRateChartCells.rateChartId, id)).orderBy(mpRateChartCells.fat, mpRateChartCells.snf),
      this.db.select().from(mpRateChartRules).where(eq(mpRateChartRules.rateChartId, id)),
    ]);
    return { ...chart, cells, rules };
  }

  async create(input: CreateRateChartInput): Promise<RateChartDetail> {
    const id = await this.db.transaction(async (tx) => {
      const [chart] = await tx.insert(mpRateCharts).values({
        tenantId: this.tenantId,
        name: input.name,
        scopeNodeId: input.scopeNodeId ?? null,
        milkType: input.milkType,
        pricingMode: input.pricingMode,
        flatRatePerLitre: numOrNull(input.flatRatePerLitre),
        season: input.season ?? null,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo ?? null,
      }).returning({ id: mpRateCharts.id });
      const chartId = chart!.id;
      if (input.cells.length) {
        await tx.insert(mpRateChartCells).values(input.cells.map((c) => ({
          tenantId: this.tenantId, rateChartId: chartId,
          fat: String(c.fat), snf: String(c.snf), ratePerLitre: String(c.ratePerLitre),
        })));
      }
      if (input.rules.length) {
        await tx.insert(mpRateChartRules).values(input.rules.map((r) => ({
          tenantId: this.tenantId, rateChartId: chartId, ruleType: r.ruleType,
          grade: r.grade ?? null, minQty: numOrNull(r.minQty), maxQty: numOrNull(r.maxQty),
          bonusPerLitre: String(r.bonusPerLitre),
        })));
      }
      return chartId;
    });
    return this.getById(id);
  }

  async deactivate(id: string): Promise<MpRateChartRow> {
    await this.getById(id);
    const [row] = await this.db.update(mpRateCharts)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(mpRateCharts.tenantId, this.tenantId), eq(mpRateCharts.id, id))).returning();
    return row!;
  }

  /** Resolve the per-litre rate for a pour. Used by the pour-capture path (A3). */
  async resolveRate(input: ResolveRateInput): Promise<RateResolution> {
    const onDate = input.onDate ?? new Date().toISOString().slice(0, 10);
    const chart = await this.findActiveChart(input.milkType, onDate, input.scopeNodeId ?? null);
    if (!chart) throw new NotFoundError(`No active ${input.milkType} rate chart effective ${onDate}`);
    const base = chart.pricingMode === 'flat'
      ? Number(chart.flatRatePerLitre)
      : await this.matrixRate(chart.id, input.fat, input.snf);
    const grade = deriveGrade(input.fat, input.snf);
    const bonus = await this.bonusFor(chart.id, grade, input.cycleQtyLitres);
    return {
      rateChartId: chart.id,
      baseRatePerLitre: round2(base),
      bonusPerLitre: round2(bonus),
      ratePerLitre: round2(base + bonus),
      grade,
    };
  }

  private async findActiveChart(
    milkType: ResolveRateInput['milkType'],
    onDate: string,
    scopeNodeId: string | null,
  ): Promise<MpRateChartRow | null> {
    const candidates = await this.db.select().from(mpRateCharts).where(and(
      eq(mpRateCharts.tenantId, this.tenantId),
      eq(mpRateCharts.milkType, milkType),
      eq(mpRateCharts.isActive, true),
      lte(mpRateCharts.effectiveFrom, onDate),
      or(isNull(mpRateCharts.effectiveTo), gte(mpRateCharts.effectiveTo, onDate)),
    )).orderBy(desc(mpRateCharts.effectiveFrom));
    // prefer a chart scoped to this node; else fall back to a tenant-wide one
    const scoped = scopeNodeId ? candidates.find((c) => c.scopeNodeId === scopeNodeId) : undefined;
    return scoped ?? candidates.find((c) => c.scopeNodeId === null) ?? null;
  }

  private async matrixRate(chartId: string, fat: number, snf: number): Promise<number> {
    // nearest-floor: largest cell with fat ≤ input and snf ≤ input
    const [cell] = await this.db.select().from(mpRateChartCells).where(and(
      eq(mpRateChartCells.rateChartId, chartId),
      lte(mpRateChartCells.fat, String(fat)),
      lte(mpRateChartCells.snf, String(snf)),
    )).orderBy(desc(mpRateChartCells.fat), desc(mpRateChartCells.snf)).limit(1);
    if (!cell) throw new NotFoundError(`No rate cell for fat=${fat}, snf=${snf}`);
    return Number(cell.ratePerLitre);
  }

  private async bonusFor(chartId: string, grade: Grade, cycleQty?: number): Promise<number> {
    const rules: Rule[] = await this.db.select().from(mpRateChartRules)
      .where(eq(mpRateChartRules.rateChartId, chartId));
    let bonus = 0;
    for (const r of rules) {
      if (r.ruleType === 'quality_bonus' && r.grade === grade) bonus += Number(r.bonusPerLitre);
      if (r.ruleType === 'volume_slab' && cycleQty != null) {
        const min = r.minQty != null ? Number(r.minQty) : -Infinity;
        const max = r.maxQty != null ? Number(r.maxQty) : Infinity;
        if (cycleQty >= min && cycleQty <= max) bonus += Number(r.bonusPerLitre);
      }
    }
    return bonus;
  }

  private buildWhere(filters: RateChartFilter) {
    const conds = [eq(mpRateCharts.tenantId, this.tenantId)];
    if (filters.milkType) conds.push(eq(mpRateCharts.milkType, filters.milkType));
    if (filters.scopeNodeId) conds.push(eq(mpRateCharts.scopeNodeId, filters.scopeNodeId));
    if (filters.isActive !== undefined) conds.push(eq(mpRateCharts.isActive, filters.isActive));
    return and(...conds);
  }
}

/**
 * Default grade heuristic. Placeholder thresholds — to be made configurable
 * per pilot (tracker C4). A: FAT≥4.0 & SNF≥8.5 · B: FAT≥3.5 & SNF≥8.0 · else C.
 */
function deriveGrade(fat: number, snf: number): Grade {
  if (fat >= 4.0 && snf >= 8.5) return 'a';
  if (fat >= 3.5 && snf >= 8.0) return 'b';
  return 'c';
}

function numOrNull(v: number | null | undefined): string | null {
  return v != null ? String(v) : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
