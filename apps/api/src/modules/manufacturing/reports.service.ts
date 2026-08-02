import { and, eq, gte, lte, sql, ilike, inArray } from 'drizzle-orm';
import { boms, workOrders, items, warehouses } from '@runq/db';
import type { Db } from '@runq/db';
import { istDate, istToday } from './mfg-day';
import type {
  MfgDashboard,
  WoSummaryRow,
  YieldTrendPoint,
  BomUsageRow,
  WoPendingCloseRow,
} from '@runq/types';
import type {
  WoSummaryFilter,
  YieldTrendFilter,
  BomUsageFilter,
  WoPendingCloseFilter,
} from '@runq/validators';

// ─── Alias tables for join disambiguation ──────────────────────────────────
// We need to join items twice in wo-summary (output item + warehouse).
// Drizzle supports aliasing via the schema object directly.

const outputItem = items;

// ─── Helpers ───────────────────────────────────────────────────────────────

function toDateStr(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  return typeof d === 'string' ? d : d.toISOString();
}

function defaultFrom(filter: { from?: string }): string {
  return filter.from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function defaultTo(filter: { to?: string }): string {
  return filter.to ?? new Date().toISOString().slice(0, 10);
}

// ─── Service ───────────────────────────────────────────────────────────────

export class ManufacturingReportsService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  // ── Dashboard ─────────────────────────────────────────────────────────────

  async getDashboard(): Promise<MfgDashboard> {
    const tid = this.tenantId;

    const [
      activeBomRes,
      draftWoRes,
      scheduledTodayRes,
      inProgressRes,
      completedTodayRes,
      pendingCloseRes,
      todayOutputRes,
      weekVarianceRes,
      topBomsRes,
    ] = await Promise.all([
      this._countActiveBoms(tid),
      this._countByStatus(tid, 'draft'),
      this._countScheduledToday(tid),
      this._countByStatus(tid, 'in_progress'),
      this._countCompletedToday(tid),
      this._countByStatus(tid, 'completed'),
      this._todayOutput(tid),
      this._weekVariance(tid),
      this._topBomsThisWeek(tid),
    ]);

    return {
      activeBomCount: Number(activeBomRes),
      draftWoCount: Number(draftWoRes),
      scheduledTodayCount: Number(scheduledTodayRes),
      inProgressCount: Number(inProgressRes),
      completedTodayCount: Number(completedTodayRes),
      wosCompletedPendingClose: Number(pendingCloseRes),
      todayPlannedOutput: Number(todayOutputRes.planned ?? 0),
      todayActualOutput: Number(todayOutputRes.actual ?? 0),
      weekVariancePct: weekVarianceRes !== null ? Number(weekVarianceRes) : null,
      topBomsThisWeek: topBomsRes,
    };
  }

  private async _countActiveBoms(tid: string): Promise<string | number> {
    const [r] = await this.db
      .select({ count: sql<string>`count(*)` })
      .from(boms)
      .where(and(eq(boms.tenantId, tid), eq(boms.isActive, true)));
    return r?.count ?? 0;
  }

  private async _countByStatus(tid: string, status: string): Promise<string | number> {
    const [r] = await this.db
      .select({ count: sql<string>`count(*)` })
      .from(workOrders)
      .where(
        and(
          eq(workOrders.tenantId, tid),
          sql`${workOrders.status} = ${status}`,
        ),
      );
    return r?.count ?? 0;
  }

  private async _countCompletedToday(tid: string): Promise<string | number> {
    const [row] = await this.db
      .select({ c: sql<number>`count(*)::int` })
      .from(workOrders)
      .where(
        and(
          eq(workOrders.tenantId, tid),
          sql`${istDate(workOrders.completedAt)} = ${istToday()}`,
          sql`${workOrders.status} <> 'cancelled'`,
        ),
      );
    return row?.c ?? 0;
  }

  private async _countScheduledToday(tid: string): Promise<string | number> {
    const [r] = await this.db
      .select({ count: sql<string>`count(*)` })
      .from(workOrders)
      .where(
        and(
          eq(workOrders.tenantId, tid),
          sql`${workOrders.scheduledFor} = ${istToday()}`,
          sql`${workOrders.status} <> 'cancelled'`,
        ),
      );
    return r?.count ?? 0;
  }

  private async _todayOutput(
    tid: string,
  ): Promise<{ planned: string | null; actual: string | null }> {
    const [r] = await this.db
      .select({
        planned: sql<string | null>`SUM(${workOrders.plannedQty})`,
        actual: sql<string | null>`SUM(${workOrders.outputQty})`,
      })
      .from(workOrders)
      .where(
        and(
          eq(workOrders.tenantId, tid),
          sql`${workOrders.scheduledFor} = ${istToday()}`,
        ),
      );
    return { planned: r?.planned ?? null, actual: r?.actual ?? null };
  }

  private async _weekVariance(tid: string): Promise<string | null> {
    const [r] = await this.db
      .select({
        avg: sql<string | null>`AVG(
          (${workOrders.yieldVariance} / NULLIF(${workOrders.outputValue}, 0)) * 100
        )`,
      })
      .from(workOrders)
      .where(
        and(
          eq(workOrders.tenantId, tid),
          sql`${workOrders.status} = 'closed'`,
          sql`${workOrders.closedAt} >= NOW() - INTERVAL '7 days'`,
        ),
      );
    return r?.avg ?? null;
  }

  private async _topBomsThisWeek(
    tid: string,
  ): Promise<Array<{ bomId: string; bomCode: string; bomName: string; runs: number }>> {
    const rows = await this.db
      .select({
        bomId: boms.id,
        bomCode: boms.bomCode,
        bomName: boms.name,
        runs: sql<string>`count(${workOrders.id})`,
      })
      .from(workOrders)
      .innerJoin(boms, eq(boms.id, workOrders.bomId))
      .where(
        and(
          eq(workOrders.tenantId, tid),
          sql`${workOrders.createdAt} >= NOW() - INTERVAL '7 days'`,
        ),
      )
      .groupBy(boms.id, boms.bomCode, boms.name)
      .orderBy(sql`count(${workOrders.id}) DESC`)
      .limit(5);

    return rows.map((r) => ({
      bomId: r.bomId,
      bomCode: r.bomCode,
      bomName: r.bomName,
      runs: Number(r.runs),
    }));
  }

  // ── WO Summary ────────────────────────────────────────────────────────────

  async woSummary(filter: WoSummaryFilter): Promise<WoSummaryRow[]> {
    const from = filter.from ?? defaultFrom({});
    const to = filter.to ?? defaultTo({});

    // Parse status list; default to closed
    const statusList: string[] = filter.status
      ? filter.status.split(',').map((s) => s.trim()).filter(Boolean)
      : ['closed'];

    const rows = await this.db
      .select({
        woId: workOrders.id,
        woNumber: workOrders.woNumber,
        bomCode: boms.bomCode,
        bomName: boms.name,
        outputItemName: outputItem.name,
        warehouseName: warehouses.name,
        scheduledFor: workOrders.scheduledFor,
        status: workOrders.status,
        plannedQty: workOrders.plannedQty,
        actualOutputQty: workOrders.outputQty,
        consumedValue: workOrders.consumedValue,
        outputValue: workOrders.outputValue,
        yieldVariance: workOrders.yieldVariance,
        closedAt: workOrders.closedAt,
      })
      .from(workOrders)
      .innerJoin(boms, eq(boms.id, workOrders.bomId))
      .innerJoin(outputItem, eq(outputItem.id, boms.outputItemId))
      .innerJoin(warehouses, eq(warehouses.id, workOrders.warehouseId))
      .where(
        and(
          eq(workOrders.tenantId, this.tenantId),
          gte(workOrders.scheduledFor, from),
          lte(workOrders.scheduledFor, to),
          filter.bomId ? eq(workOrders.bomId, filter.bomId) : undefined,
          filter.warehouseId ? eq(workOrders.warehouseId, filter.warehouseId) : undefined,
          // Status column is the `wo_status` enum; cast the literal array to the
          // enum type so `=` resolves. (Zod has already constrained values to
          // word characters at the route boundary — no interpolation hazard.)
          sql`${workOrders.status} = ANY(${sql.raw(`ARRAY[${statusList.map((s) => `'${s}'`).join(',')}]::wo_status[]`)})`,
        ),
      )
      .orderBy(
        sql`${workOrders.closedAt} DESC NULLS LAST`,
        sql`${workOrders.scheduledFor} DESC`,
      );

    return rows.map((r) => {
      const outVal = Number(r.outputValue);
      const yieldVar = Number(r.yieldVariance);
      const yieldVariancePct = outVal !== 0 ? (yieldVar / outVal) * 100 : null;

      return {
        woId: r.woId,
        woNumber: r.woNumber,
        bomCode: r.bomCode,
        bomName: r.bomName,
        outputItemName: r.outputItemName,
        warehouseName: r.warehouseName,
        scheduledFor: String(r.scheduledFor),
        status: r.status,
        plannedQty: Number(r.plannedQty),
        actualOutputQty: Number(r.actualOutputQty),
        consumedValue: Number(r.consumedValue),
        outputValue: outVal,
        yieldVariance: yieldVar,
        yieldVariancePct,
        closedAt: toDateStr(r.closedAt),
      };
    });
  }

  // ── Yield Trend ───────────────────────────────────────────────────────────

  async yieldTrend(filter: YieldTrendFilter): Promise<YieldTrendPoint[]> {
    const from = filter.from ?? defaultFrom({});
    const to = filter.to ?? defaultTo({});
    const bucket = filter.bucket ?? 'day';

    const truncExpr = sql.raw(`date_trunc('${bucket}', work_orders.scheduled_for::timestamp)`);

    const rows = await this.db
      .select({
        bucketDate: sql<string>`${truncExpr}::date`,
        bomId: boms.id,
        bomCode: boms.bomCode,
        runs: sql<string>`count(${workOrders.id})`,
        plannedQty: sql<string>`SUM(${workOrders.plannedQty})`,
        actualOutputQty: sql<string>`SUM(${workOrders.outputQty})`,
      })
      .from(workOrders)
      .innerJoin(boms, eq(boms.id, workOrders.bomId))
      .where(
        and(
          eq(workOrders.tenantId, this.tenantId),
          gte(workOrders.scheduledFor, from),
          lte(workOrders.scheduledFor, to),
          filter.bomId ? eq(workOrders.bomId, filter.bomId) : undefined,
        ),
      )
      .groupBy(sql`${truncExpr}::date`, boms.id, boms.bomCode)
      .orderBy(sql`${truncExpr}::date ASC`, boms.bomCode);

    return rows.map((r) => {
      const planned = Number(r.plannedQty);
      const actual = Number(r.actualOutputQty);
      const yieldPct = planned !== 0 ? (actual / planned) * 100 : null;

      return {
        bucketDate: String(r.bucketDate),
        bomId: r.bomId,
        bomCode: r.bomCode,
        runs: Number(r.runs),
        plannedQty: planned,
        actualOutputQty: actual,
        yieldPct,
      };
    });
  }

  // ── BOM Usage ─────────────────────────────────────────────────────────────

  async bomUsage(filter: BomUsageFilter): Promise<BomUsageRow[]> {
    const from = filter.from ?? defaultFrom({});
    const to = filter.to ?? defaultTo({});

    const rows = await this.db
      .select({
        bomId: boms.id,
        bomCode: boms.bomCode,
        bomName: boms.name,
        outputItemName: outputItem.name,
        isActive: boms.isActive,
        runs: sql<string>`count(${workOrders.id})`,
        closedRuns: sql<string>`count(${workOrders.id}) FILTER (WHERE ${workOrders.status} = 'closed')`,
        totalPlannedQty: sql<string>`COALESCE(SUM(${workOrders.plannedQty}), 0)`,
        totalActualQty: sql<string>`COALESCE(SUM(${workOrders.outputQty}), 0)`,
        avgYieldVariancePct: sql<string | null>`AVG(
          (${workOrders.yieldVariance} / NULLIF(${workOrders.outputValue}, 0)) * 100
        ) FILTER (WHERE ${workOrders.status} = 'closed')`,
        lastRunAt: sql<string | null>`MAX(${workOrders.createdAt})`,
      })
      .from(boms)
      .innerJoin(outputItem, eq(outputItem.id, boms.outputItemId))
      .leftJoin(
        workOrders,
        and(
          eq(workOrders.bomId, boms.id),
          gte(workOrders.scheduledFor, from),
          lte(workOrders.scheduledFor, to),
        ),
      )
      .where(
        and(
          eq(boms.tenantId, this.tenantId),
          filter.isActive !== undefined ? eq(boms.isActive, filter.isActive) : undefined,
          filter.search
            ? ilike(boms.name, `%${filter.search}%`)
            : undefined,
        ),
      )
      .groupBy(boms.id, boms.bomCode, boms.name, boms.isActive, outputItem.name)
      .orderBy(sql`count(${workOrders.id}) DESC`, boms.bomCode);

    return rows.map((r) => ({
      bomId: r.bomId,
      bomCode: r.bomCode,
      bomName: r.bomName,
      outputItemName: r.outputItemName,
      isActive: r.isActive,
      runs: Number(r.runs),
      closedRuns: Number(r.closedRuns),
      totalPlannedQty: Number(r.totalPlannedQty),
      totalActualQty: Number(r.totalActualQty),
      avgYieldVariancePct: r.avgYieldVariancePct !== null ? Number(r.avgYieldVariancePct) : null,
      lastRunAt: toDateStr(r.lastRunAt),
    }));
  }

  // ── WO Pending Close ──────────────────────────────────────────────────────

  async woPendingClose(filter: WoPendingCloseFilter): Promise<WoPendingCloseRow[]> {
    const minAge = filter.minAgeDays ?? 0;

    const rows = await this.db
      .select({
        woId: workOrders.id,
        woNumber: workOrders.woNumber,
        bomCode: boms.bomCode,
        bomName: boms.name,
        scheduledFor: workOrders.scheduledFor,
        completedAt: workOrders.completedAt,
        consumedValue: workOrders.consumedValue,
        ageDays: sql<string>`EXTRACT(DAY FROM NOW() - ${workOrders.completedAt})::int`,
      })
      .from(workOrders)
      .innerJoin(boms, eq(boms.id, workOrders.bomId))
      .where(
        and(
          eq(workOrders.tenantId, this.tenantId),
          sql`${workOrders.status} = 'completed'`,
          minAge > 0
            ? sql`EXTRACT(DAY FROM NOW() - ${workOrders.completedAt}) >= ${minAge}`
            : undefined,
        ),
      )
      .orderBy(sql`EXTRACT(DAY FROM NOW() - ${workOrders.completedAt}) DESC`);

    return rows.map((r) => ({
      woId: r.woId,
      woNumber: r.woNumber,
      bomCode: r.bomCode,
      bomName: r.bomName,
      scheduledFor: String(r.scheduledFor),
      completedAt: r.completedAt ? r.completedAt.toISOString() : '',
      consumedValue: Number(r.consumedValue),
      ageDays: Number(r.ageDays ?? 0),
    }));
  }
}
