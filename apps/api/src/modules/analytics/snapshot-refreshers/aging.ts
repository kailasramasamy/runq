import { sql } from 'drizzle-orm';
import type { MetricRefresher, RefreshContext } from '../refresh-registry';
import { upsertSnapshot } from '../snapshot-store';

export interface AgingBucket {
  key: '0-30' | '31-60' | '61-90' | '90+';
  amount: number;
  count: number;
}
export interface AgingPayload {
  buckets: AgingBucket[];
  total: number;
  totalCount: number;
}

const OPEN_AR = `('sent','partially_paid','overdue')`;
const OPEN_AP = `('pending_match','matched','approved','partially_paid')`;

function todayTag(now: Date): string {
  return new Date(now.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

async function computeAging(
  ctx: RefreshContext,
  table: 'sales_invoices' | 'purchase_invoices',
  openStatuses: string,
): Promise<AgingPayload> {
  const res = await ctx.db.execute(sql`
    SELECT
      CASE
        WHEN CURRENT_DATE - due_date <= 30 THEN '0-30'
        WHEN CURRENT_DATE - due_date <= 60 THEN '31-60'
        WHEN CURRENT_DATE - due_date <= 90 THEN '61-90'
        ELSE '90+'
      END AS bucket,
      COALESCE(SUM(balance_due), 0) AS amount,
      COUNT(*)::int AS cnt
    FROM ${sql.raw(table)}
    WHERE tenant_id = ${ctx.tenantId}
      AND balance_due > 0
      AND status IN ${sql.raw(openStatuses)}
    GROUP BY 1
  `);
  const rows = ((res as unknown as { rows: Array<{ bucket: string; amount: unknown; cnt: number }> }).rows) ?? [];
  const map = new Map(rows.map((r) => [r.bucket, { amount: Number(r.amount) || 0, count: r.cnt }]));
  const buckets: AgingBucket[] = (['0-30', '31-60', '61-90', '90+'] as const).map((k) => ({
    key: k,
    amount: map.get(k)?.amount ?? 0,
    count: map.get(k)?.count ?? 0,
  }));
  return {
    buckets,
    total: buckets.reduce((s, b) => s + b.amount, 0),
    totalCount: buckets.reduce((s, b) => s + b.count, 0),
  };
}

export const arAgingRefresher: MetricRefresher = {
  metricKey: 'ar_aging',
  cadence: 'nightly',
  async refresh(ctx) {
    const payload = await computeAging(ctx, 'sales_invoices', OPEN_AR);
    await upsertSnapshot(ctx.db, ctx.tenantId, 'ar_aging', todayTag(ctx.now), payload);
  },
};

export const apAgingRefresher: MetricRefresher = {
  metricKey: 'ap_aging',
  cadence: 'nightly',
  async refresh(ctx) {
    const payload = await computeAging(ctx, 'purchase_invoices', OPEN_AP);
    await upsertSnapshot(ctx.db, ctx.tenantId, 'ap_aging', todayTag(ctx.now), payload);
  },
};
