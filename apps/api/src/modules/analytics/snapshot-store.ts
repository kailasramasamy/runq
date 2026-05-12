import { sql } from 'drizzle-orm';
import { analyticsSnapshots } from '@runq/db';
import type { Db } from '@runq/db';

export interface SnapshotRow<T = unknown> {
  metricKey: string;
  period: string;
  payload: T;
  computedAt: Date;
}

export async function upsertSnapshot<T>(
  db: Db,
  tenantId: string,
  metricKey: string,
  period: string,
  payload: T,
): Promise<void> {
  await db
    .insert(analyticsSnapshots)
    .values({ tenantId, metricKey, period, payload: payload as never })
    .onConflictDoUpdate({
      target: [analyticsSnapshots.tenantId, analyticsSnapshots.metricKey, analyticsSnapshots.period],
      set: { payload: payload as never, computedAt: sql`NOW()` },
    });
}

export async function getSnapshot<T>(
  db: Db,
  tenantId: string,
  metricKey: string,
  period: string,
): Promise<SnapshotRow<T> | null> {
  const rows = await db
    .select({
      metricKey: analyticsSnapshots.metricKey,
      period: analyticsSnapshots.period,
      payload: analyticsSnapshots.payload,
      computedAt: analyticsSnapshots.computedAt,
    })
    .from(analyticsSnapshots)
    .where(sql`tenant_id = ${tenantId} AND metric_key = ${metricKey} AND period = ${period}`)
    .limit(1);
  if (rows.length === 0) return null;
  return rows[0] as SnapshotRow<T>;
}
