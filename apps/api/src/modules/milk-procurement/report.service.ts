import { and, eq, sql, gte, lte } from 'drizzle-orm';
import { mpPours } from '@runq/db';
import type { Db } from '@runq/db';
import type { CollectionReportQuery } from '@runq/validators';

export interface CollectionSummary {
  from: string;
  to: string;
  nodeId: string | null;
  totalQty: number;
  amQty: number;
  pmQty: number;
  pourCount: number;
  farmerCount: number;
  avgFat: number;
  avgSnf: number;
  grossAmount: number;
}

/** Collection rollups over recorded pours. */
export class ReportService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async collectionSummary(q: CollectionReportQuery): Promise<CollectionSummary> {
    const conds = [
      eq(mpPours.tenantId, this.tenantId), eq(mpPours.status, 'recorded'),
      gte(mpPours.collectionDate, q.from), lte(mpPours.collectionDate, q.to),
    ];
    if (q.nodeId) conds.push(eq(mpPours.nodeId, q.nodeId));
    const [r] = await this.db.select({
      totalQty: sql<string>`coalesce(sum(${mpPours.qtyLitres}), 0)`,
      amQty: sql<string>`coalesce(sum(${mpPours.qtyLitres}) filter (where ${mpPours.shift} = 'am'), 0)`,
      pmQty: sql<string>`coalesce(sum(${mpPours.qtyLitres}) filter (where ${mpPours.shift} = 'pm'), 0)`,
      pourCount: sql<number>`count(*)::int`,
      farmerCount: sql<number>`count(distinct ${mpPours.farmerId})::int`,
      avgFat: sql<string>`coalesce(round(avg(${mpPours.fat}), 2), 0)`,
      avgSnf: sql<string>`coalesce(round(avg(${mpPours.snf}), 2), 0)`,
      grossAmount: sql<string>`coalesce(sum(${mpPours.lineAmount}), 0)`,
    }).from(mpPours).where(and(...conds));
    return {
      from: q.from, to: q.to, nodeId: q.nodeId ?? null,
      totalQty: Number(r?.totalQty ?? 0),
      amQty: Number(r?.amQty ?? 0),
      pmQty: Number(r?.pmQty ?? 0),
      pourCount: r?.pourCount ?? 0,
      farmerCount: r?.farmerCount ?? 0,
      avgFat: Number(r?.avgFat ?? 0),
      avgSnf: Number(r?.avgSnf ?? 0),
      grossAmount: Number(r?.grossAmount ?? 0),
    };
  }
}
