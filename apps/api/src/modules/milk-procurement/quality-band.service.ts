import { and, eq, isNull, or } from 'drizzle-orm';
import { mpQualityBands } from '@runq/db';
import type { Db } from '@runq/db';
import type { UpsertQualityBandsInput } from '@runq/validators';

export type QualityMetric = 'fat' | 'snf' | 'clr';
export type QualityLevel = 'good' | 'watch' | 'low';
export type Grade = 'a' | 'b' | 'c';
type MilkType = 'cow' | 'buffalo' | 'mixed' | 'cow_a1' | 'cow_a2';

export interface Band {
  goodMin: number;
  watchMin: number;
}
export type MetricBands = Partial<Record<QualityMetric, Band>>;

const MILK_TYPES: MilkType[] = ['cow', 'buffalo', 'mixed', 'cow_a1', 'cow_a2'];

// Cow-family (legacy cow + A1 + A2) share the same normal range; buffalo milk is
// far richer, so a single global threshold would mis-grade both. These seed the
// effective bands when a tenant has configured none — they reproduce the prior
// hardcoded heuristic for cow and add sensible buffalo/CLR defaults.
const COW: MetricBands = {
  fat: { goodMin: 4.0, watchMin: 3.5 },
  snf: { goodMin: 8.5, watchMin: 8.0 },
  clr: { goodMin: 27, watchMin: 26 },
};
const SEED: Record<MilkType, MetricBands> = {
  cow: COW,
  cow_a1: COW,
  cow_a2: COW,
  mixed: {
    fat: { goodMin: 4.5, watchMin: 4.0 },
    snf: { goodMin: 8.5, watchMin: 8.0 },
    clr: { goodMin: 27, watchMin: 26 },
  },
  buffalo: {
    fat: { goodMin: 6.0, watchMin: 5.5 },
    snf: { goodMin: 9.0, watchMin: 8.5 },
    clr: { goodMin: 28, watchMin: 27 },
  },
};

/** Which band a single reading falls in (higher = better within range). */
export function bandLevel(value: number, b: Band): QualityLevel {
  if (value >= b.goodMin) return 'good';
  if (value >= b.watchMin) return 'watch';
  return 'low';
}

/**
 * Per-pour grade = worst band across the metrics present. CLR (lactometer)
 * grades on CLR alone; analyzer pours grade on the worse of FAT/SNF. Returns
 * null only when no band applies to any supplied reading.
 */
export function gradeFromBands(
  bands: MetricBands,
  r: { fat?: number | null; snf?: number | null; clr?: number | null },
): Grade | null {
  const levels: QualityLevel[] = [];
  if (r.clr != null && bands.clr) {
    levels.push(bandLevel(r.clr, bands.clr));
  } else {
    if (r.fat != null && bands.fat) levels.push(bandLevel(r.fat, bands.fat));
    if (r.snf != null && bands.snf) levels.push(bandLevel(r.snf, bands.snf));
  }
  if (levels.length === 0) return null;
  if (levels.includes('low')) return 'c';
  if (levels.includes('watch')) return 'b';
  return 'a';
}

type BandRow = typeof mpQualityBands.$inferSelect;

/** Configurable milk-quality bands — resolution (node → tenant → seed) + config. */
export class QualityBandService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  /** Effective bands for one milk type at a node: node override → tenant → seed. */
  async resolve(milkType: MilkType, nodeId: string | null): Promise<MetricBands> {
    const rows = await this.loadRows(nodeId);
    return this.merge(milkType, rows, nodeId);
  }

  /** Effective bands for every milk type at a node — the client colouring payload. */
  async resolveAll(nodeId: string | null): Promise<Record<string, MetricBands>> {
    const rows = await this.loadRows(nodeId);
    const out: Record<string, MetricBands> = {};
    for (const mt of MILK_TYPES) out[mt] = this.merge(mt, rows, nodeId);
    return out;
  }

  /** Raw configured rows at a scope (no seed fallback) — for the settings editor. */
  async listConfig(nodeId: string | null): Promise<BandRow[]> {
    return this.db.select().from(mpQualityBands).where(and(
      eq(mpQualityBands.tenantId, this.tenantId),
      nodeId ? eq(mpQualityBands.nodeId, nodeId) : isNull(mpQualityBands.nodeId),
    ));
  }

  /** Replace the whole band set for one scope (delete-then-insert) in one txn. */
  async upsert(input: UpsertQualityBandsInput): Promise<BandRow[]> {
    const nodeId = input.nodeId ?? null;
    return this.db.transaction(async (tx) => {
      await tx.delete(mpQualityBands).where(and(
        eq(mpQualityBands.tenantId, this.tenantId),
        nodeId ? eq(mpQualityBands.nodeId, nodeId) : isNull(mpQualityBands.nodeId),
      ));
      if (input.bands.length === 0) return [];
      return tx.insert(mpQualityBands).values(input.bands.map((b) => ({
        tenantId: this.tenantId,
        nodeId,
        milkType: b.milkType,
        metric: b.metric,
        goodMin: String(b.goodMin),
        watchMin: String(b.watchMin),
      }))).returning();
    });
  }

  // Rows for this tenant scoped to the node + the tenant default (one query).
  private async loadRows(nodeId: string | null): Promise<BandRow[]> {
    return this.db.select().from(mpQualityBands).where(and(
      eq(mpQualityBands.tenantId, this.tenantId),
      nodeId
        ? or(eq(mpQualityBands.nodeId, nodeId), isNull(mpQualityBands.nodeId))
        : isNull(mpQualityBands.nodeId),
    ));
  }

  // Per metric: node-scoped row wins, else tenant default, else seed constant.
  private merge(milkType: MilkType, rows: BandRow[], nodeId: string | null): MetricBands {
    const mine = rows.filter((r) => r.milkType === milkType);
    const pick = (metric: QualityMetric): Band | undefined => {
      const scoped = nodeId ? mine.find((r) => r.metric === metric && r.nodeId === nodeId) : undefined;
      const tenant = mine.find((r) => r.metric === metric && r.nodeId === null);
      const row = scoped ?? tenant;
      if (row) return { goodMin: Number(row.goodMin), watchMin: Number(row.watchMin) };
      return SEED[milkType]?.[metric];
    };
    const out: MetricBands = {};
    for (const m of ['fat', 'snf', 'clr'] as QualityMetric[]) {
      const b = pick(m);
      if (b) out[m] = b;
    }
    return out;
  }
}
