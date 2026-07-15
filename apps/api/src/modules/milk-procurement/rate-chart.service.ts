import { and, eq, desc, sql, lte, gte, isNull, or } from 'drizzle-orm';
import { mpRateCharts, mpRateChartCells, mpRateChartRules, mpNodes, mpFarmers, tenants } from '@runq/db';
import type { Db, MpRateChartRow } from '@runq/db';
import { applyPagination, calcTotalPages } from '@runq/db';
import type { PaginationMeta } from '@runq/types';
import type { CreateRateChartInput, RateChartFilter, ResolveRateInput } from '@runq/validators';
import { NotFoundError, ValidationError } from '../../utils/errors';
import type { RateChartPrintData } from './rate-chart-template';
import { QualityBandService, gradeFromBands } from './quality-band.service';

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
  // null on CLR (lactometer) charts — no fat/SNF to grade on.
  grade: Grade | null;
}

type PricingMode = MpRateChartRow['pricingMode'];

/** Rate charts (matrix/flat) + the per-pour rate resolution used by A3. */
export class RateChartService {
  private readonly bands: QualityBandService;

  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {
    this.bands = new QualityBandService(db, tenantId);
  }

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
        .where(eq(mpRateChartCells.rateChartId, id))
        .orderBy(mpRateChartCells.clr, mpRateChartCells.fat, mpRateChartCells.snf),
      this.db.select().from(mpRateChartRules).where(eq(mpRateChartRules.rateChartId, id)),
    ]);
    return { ...chart, cells, rules };
  }

  /** Assemble the data the PDF/print template needs: chart + tenant + scope names. */
  async getPrintData(id: string, generatedAt: string): Promise<RateChartPrintData> {
    const chart = await this.getById(id);
    const [[t], scopeNode] = await Promise.all([
      this.db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, this.tenantId)).limit(1),
      chart.scopeNodeId
        ? this.db.select({ name: mpNodes.name }).from(mpNodes).where(eq(mpNodes.id, chart.scopeNodeId)).limit(1)
        : Promise.resolve([] as { name: string }[]),
    ]);
    return {
      tenantName: t?.name ?? 'Dhenu',
      chart: {
        name: chart.name, milkType: chart.milkType, pricingMode: chart.pricingMode,
        flatRatePerLitre: chart.flatRatePerLitre, season: chart.season,
        effectiveFrom: chart.effectiveFrom, effectiveTo: chart.effectiveTo, isActive: chart.isActive,
      },
      scopeName: chart.scopeNodeId ? (scopeNode[0]?.name ?? 'VMCC') : 'Tenant-wide',
      cells: chart.cells, rules: chart.rules,
      generatedAt,
    };
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
          fat: numOrNull(c.fat), snf: numOrNull(c.snf), clr: numOrNull(c.clr),
          ratePerLitre: String(c.ratePerLitre),
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
    // CLR supplied → lactometer (clr) chart; else fat/SNF → matrix/flat chart.
    const useClr = input.clr != null;
    const modes: PricingMode[] = useClr ? ['clr'] : ['matrix', 'flat'];
    const chart = await this.pickChart(input, onDate, modes);
    if (!chart) {
      const kind = useClr ? 'CLR' : input.milkType;
      throw new NotFoundError(`No active ${kind} rate chart effective ${onDate}`);
    }
    const base = chart.pricingMode === 'flat'
      ? Number(chart.flatRatePerLitre)
      : chart.pricingMode === 'clr'
        ? await this.clrRate(chart.id, input.clr!)
        : await this.matrixRate(chart.id, input.fat!, input.snf!);
    // Grade from configurable bands: milk-type aware, and now grades CLR
    // (lactometer) pours too instead of leaving them ungraded.
    const bands = await this.bands.resolve(input.milkType, input.scopeNodeId ?? null);
    const grade = gradeFromBands(bands, { fat: input.fat, snf: input.snf, clr: input.clr });
    const bonus = await this.bonusFor(chart.id, grade, input.cycleQtyLitres);
    return {
      rateChartId: chart.id,
      baseRatePerLitre: round2(base),
      bonusPerLitre: round2(bonus),
      ratePerLitre: round2(base + bonus),
      grade,
    };
  }

  /** Override chain: farmer's chart → VMCC's chart → scoped/tenant default.
   *  A stale or incompatible override silently falls through — never blocks a pour. */
  private async pickChart(
    input: ResolveRateInput,
    onDate: string,
    modes: PricingMode[],
  ): Promise<MpRateChartRow | null> {
    for (const id of await this.overrideChartIds(input.farmerId, input.scopeNodeId)) {
      const c = await this.chartIfUsable(id, input.milkType, onDate, modes);
      if (c) return c;
    }
    return this.findActiveChart(input.milkType, onDate, input.scopeNodeId ?? null, modes);
  }

  /** Assigned override chart ids in precedence order (farmer first). */
  private async overrideChartIds(farmerId?: string, nodeId?: string): Promise<string[]> {
    const [f, n] = await Promise.all([
      farmerId
        ? this.db.select({ id: mpFarmers.rateChartId }).from(mpFarmers)
          .where(and(eq(mpFarmers.tenantId, this.tenantId), eq(mpFarmers.id, farmerId)))
        : [],
      nodeId
        ? this.db.select({ id: mpNodes.rateChartId }).from(mpNodes)
          .where(and(eq(mpNodes.tenantId, this.tenantId), eq(mpNodes.id, nodeId)))
        : [],
    ]);
    return [f[0]?.id, n[0]?.id].filter((x): x is string => x != null);
  }

  /** The override chart iff it passes the SAME gate as the normal path:
   *  active + effective on date + milk type match + mode compatible with readings. */
  private async chartIfUsable(
    id: string,
    milkType: ResolveRateInput['milkType'],
    onDate: string,
    modes: PricingMode[],
  ): Promise<MpRateChartRow | null> {
    const [c] = await this.db.select().from(mpRateCharts)
      .where(and(eq(mpRateCharts.id, id), this.usableChartConds(milkType, onDate)));
    return c && modes.includes(c.pricingMode) ? c : null;
  }

  /** Shared WHERE: tenant + milk type + active + effective window on onDate. */
  private usableChartConds(milkType: ResolveRateInput['milkType'], onDate: string) {
    return and(
      eq(mpRateCharts.tenantId, this.tenantId),
      eq(mpRateCharts.milkType, milkType),
      eq(mpRateCharts.isActive, true),
      lte(mpRateCharts.effectiveFrom, onDate),
      or(isNull(mpRateCharts.effectiveTo), gte(mpRateCharts.effectiveTo, onDate)),
    );
  }

  private async findActiveChart(
    milkType: ResolveRateInput['milkType'],
    onDate: string,
    scopeNodeId: string | null,
    modes: PricingMode[],
  ): Promise<MpRateChartRow | null> {
    const candidates = (await this.db.select().from(mpRateCharts)
      .where(this.usableChartConds(milkType, onDate))
      .orderBy(desc(mpRateCharts.effectiveFrom)))
      .filter((c) => modes.includes(c.pricingMode));
    // prefer a chart scoped to this node; else fall back to a tenant-wide one
    const scoped = scopeNodeId ? candidates.find((c) => c.scopeNodeId === scopeNodeId) : undefined;
    return scoped ?? candidates.find((c) => c.scopeNodeId === null) ?? null;
  }

  /** CLR (lactometer) nearest-floor: largest cell with clr ≤ input. Top cell caps. */
  private async clrRate(chartId: string, clr: number): Promise<number> {
    const [cell] = await this.db.select().from(mpRateChartCells).where(and(
      eq(mpRateChartCells.rateChartId, chartId),
      lte(mpRateChartCells.clr, String(clr)),
    )).orderBy(desc(mpRateChartCells.clr)).limit(1);
    if (!cell) throw new NotFoundError(`No CLR rate cell for clr=${clr}`);
    return Number(cell.ratePerLitre);
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

  private async bonusFor(chartId: string, grade: Grade | null, cycleQty?: number): Promise<number> {
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

/** Assignment-time guard for overrides: chart must exist in this tenant and be active. */
export async function assertAssignableRateChart(db: Db, tenantId: string, id: string): Promise<void> {
  const [c] = await db.select({ isActive: mpRateCharts.isActive }).from(mpRateCharts)
    .where(and(eq(mpRateCharts.tenantId, tenantId), eq(mpRateCharts.id, id)));
  if (!c) throw new NotFoundError('Rate chart');
  if (!c.isActive) throw new ValidationError('Rate chart is inactive');
}

function numOrNull(v: number | null | undefined): string | null {
  return v != null ? String(v) : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
