import { and, eq, desc, sql, lte, gte, isNull, or } from 'drizzle-orm';
import {
  mpRateCharts, mpRateChartCells, mpRateChartRules, mpRateChartAssignments,
  mpNodes, mpFarmers, mpFarmerMemberships, tenants, pricingFamilyOf,
} from '@runq/db';
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

export type RateScope = 'tenant' | 'node' | 'farmer';
export type PricingFamily = 'fat_snf' | 'clr';
type MilkType = ResolveRateInput['milkType'];

/** Where an effective chart came from, relative to the scope being viewed. */
export type AssignmentSource = 'own' | 'node' | 'parent' | 'tenant';

/** The chart that actually prices a slot here, and why. */
export interface EffectiveAssignment {
  milkType: MilkType;
  pricingFamily: PricingFamily;
  rateChartId: string;
  chartName: string;
  pricingMode: 'matrix' | 'flat' | 'clr';
  chartActive: boolean;
  source: AssignmentSource;
}

/** One filled slot at a scope, with enough of the chart to render it. */
export interface AssignmentRow {
  id: string;
  milkType: MilkType;
  pricingFamily: PricingFamily;
  rateChartId: string;
  chartName: string;
  pricingMode: 'matrix' | 'flat' | 'clr';
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

  // ── assignments ────────────────────────────────────────────────────────────

  /** Every assignment for a scope, with the chart joined for display. */
  async listAssignments(scopeType: RateScope, scopeId: string): Promise<AssignmentRow[]> {
    return this.db.select({
      id: mpRateChartAssignments.id,
      milkType: mpRateChartAssignments.milkType,
      pricingFamily: mpRateChartAssignments.pricingFamily,
      rateChartId: mpRateChartAssignments.rateChartId,
      chartName: mpRateCharts.name,
      pricingMode: mpRateCharts.pricingMode,
    }).from(mpRateChartAssignments)
      .innerJoin(mpRateCharts, eq(mpRateCharts.id, mpRateChartAssignments.rateChartId))
      .where(and(
        eq(mpRateChartAssignments.tenantId, this.tenantId),
        eq(mpRateChartAssignments.scopeType, scopeType),
        eq(mpRateChartAssignments.scopeId, scopeId === 'tenant' ? this.tenantId : scopeId),
      ));
  }

  /**
   * Bind a chart to a scope. The slot (milk type + family) comes from the chart
   * itself, so a caller can't file a buffalo chart under cow and have it
   * silently never apply.
   */
  async assign(scopeType: RateScope, scopeId: string, rateChartId: string): Promise<void> {
    const chart = await this.getById(rateChartId);
    const id = scopeType === 'tenant' ? this.tenantId : scopeId;
    await this.db.insert(mpRateChartAssignments).values({
      tenantId: this.tenantId, scopeType, scopeId: id,
      milkType: chart.milkType, pricingFamily: pricingFamilyOf(chart.pricingMode),
      rateChartId,
    }).onConflictDoUpdate({
      target: [
        mpRateChartAssignments.tenantId, mpRateChartAssignments.scopeType,
        mpRateChartAssignments.scopeId, mpRateChartAssignments.milkType,
        mpRateChartAssignments.pricingFamily,
      ],
      set: { rateChartId, updatedAt: new Date() },
    });
  }

  /**
   * What actually prices each (milk type, family) at this scope, and where it
   * came from. The UI shows inheritance rather than an empty box, so nobody has
   * to guess whether "no chart here" means unpriced or inherited — the silent
   * fall-through was the whole complaint.
   */
  async effectiveAssignments(scopeType: RateScope, scopeId: string): Promise<EffectiveAssignment[]> {
    const chain = await this.scopeChain(scopeType, scopeId);
    const rows = await this.db.select({
      scopeType: mpRateChartAssignments.scopeType,
      scopeId: mpRateChartAssignments.scopeId,
      milkType: mpRateChartAssignments.milkType,
      pricingFamily: mpRateChartAssignments.pricingFamily,
      chartId: mpRateCharts.id,
      chartName: mpRateCharts.name,
      pricingMode: mpRateCharts.pricingMode,
      isActive: mpRateCharts.isActive,
    }).from(mpRateChartAssignments)
      .innerJoin(mpRateCharts, eq(mpRateCharts.id, mpRateChartAssignments.rateChartId))
      .where(eq(mpRateChartAssignments.tenantId, this.tenantId));
    const slots = new Map<string, EffectiveAssignment>();
    // Walk least-specific → most-specific so a nearer scope overwrites.
    for (const link of chain) {
      for (const r of rows) {
        if (r.scopeType !== link.type || r.scopeId !== link.id) continue;
        slots.set(`${r.milkType}|${r.pricingFamily}`, {
          milkType: r.milkType, pricingFamily: r.pricingFamily,
          rateChartId: r.chartId, chartName: r.chartName, pricingMode: r.pricingMode,
          chartActive: r.isActive, source: link.source,
        });
      }
    }
    return [...slots.values()];
  }

  /** Least-specific → most-specific, so the last write wins. */
  private async scopeChain(
    scopeType: RateScope, scopeId: string,
  ): Promise<{ type: RateScope; id: string; source: AssignmentSource }[]> {
    const chain: { type: RateScope; id: string; source: AssignmentSource }[] = [
      { type: 'tenant', id: this.tenantId, source: 'tenant' },
    ];
    if (scopeType === 'tenant') return chain;
    if (scopeType === 'node') {
      const parent = await this.parentNodeId(scopeId);
      if (parent) chain.push({ type: 'node', id: parent, source: 'parent' });
      chain.push({ type: 'node', id: scopeId, source: 'own' });
      return chain;
    }
    // farmer: its VMCC (primary membership) and that VMCC's CC sit in between
    const [m] = await this.db.select({ nodeId: mpFarmerMemberships.nodeId })
      .from(mpFarmerMemberships).where(and(
        eq(mpFarmerMemberships.tenantId, this.tenantId),
        eq(mpFarmerMemberships.farmerId, scopeId),
        eq(mpFarmerMemberships.isPrimary, true),
        isNull(mpFarmerMemberships.leftOn),
      ));
    if (m?.nodeId) {
      const parent = await this.parentNodeId(m.nodeId);
      if (parent) chain.push({ type: 'node', id: parent, source: 'parent' });
      chain.push({ type: 'node', id: m.nodeId, source: 'node' });
    }
    chain.push({ type: 'farmer', id: scopeId, source: 'own' });
    return chain;
  }

  /** Clear one slot — the scope falls back to inheriting again. */
  async unassign(scopeType: RateScope, scopeId: string, milkType: MilkType, family: PricingFamily): Promise<void> {
    await this.db.delete(mpRateChartAssignments).where(and(
      eq(mpRateChartAssignments.tenantId, this.tenantId),
      eq(mpRateChartAssignments.scopeType, scopeType),
      eq(mpRateChartAssignments.scopeId, scopeType === 'tenant' ? this.tenantId : scopeId),
      eq(mpRateChartAssignments.milkType, milkType),
      eq(mpRateChartAssignments.pricingFamily, family),
    ));
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

  /** Assignment chain: farmer → VMCC → its parent CC → tenant default, then the
   *  legacy tenant-wide scan as a backstop so an unconfigured milk type still
   *  prices rather than blocking capture. A stale or incompatible assignment
   *  silently falls through — never blocks a pour. */
  private async pickChart(
    input: ResolveRateInput,
    onDate: string,
    modes: PricingMode[],
  ): Promise<MpRateChartRow | null> {
    for (const id of await this.assignedChartIds(input, modes)) {
      const c = await this.chartIfUsable(id, input.milkType, onDate, modes);
      if (c) return c;
    }
    return this.findActiveChart(input.milkType, onDate, input.scopeNodeId ?? null, modes);
  }

  /**
   * Assigned chart ids, most specific first. Inheritance is resolved here rather
   * than copied into each scope, so moving a tenant default moves every scope
   * that hasn't overridden it.
   */
  private async assignedChartIds(input: ResolveRateInput, modes: PricingMode[]): Promise<string[]> {
    const family = pricingFamilyOf(modes.includes('clr') ? 'clr' : 'matrix');
    const parentId = input.scopeNodeId ? await this.parentNodeId(input.scopeNodeId) : null;
    const rows = await this.db.select({
      scopeType: mpRateChartAssignments.scopeType,
      scopeId: mpRateChartAssignments.scopeId,
      chartId: mpRateChartAssignments.rateChartId,
    }).from(mpRateChartAssignments).where(and(
      eq(mpRateChartAssignments.tenantId, this.tenantId),
      eq(mpRateChartAssignments.milkType, input.milkType),
      eq(mpRateChartAssignments.pricingFamily, family),
    ));
    const at = (type: 'tenant' | 'node' | 'farmer', id: string | null | undefined) =>
      id ? rows.find((r) => r.scopeType === type && r.scopeId === id)?.chartId : undefined;
    return [
      at('farmer', input.farmerId),
      at('node', input.scopeNodeId),
      at('node', parentId),
      at('tenant', this.tenantId),
    ].filter((x): x is string => x != null);
  }

  private async parentNodeId(nodeId: string): Promise<string | null> {
    const [n] = await this.db.select({ parentNodeId: mpNodes.parentNodeId }).from(mpNodes)
      .where(and(eq(mpNodes.tenantId, this.tenantId), eq(mpNodes.id, nodeId)));
    return n?.parentNodeId ?? null;
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
