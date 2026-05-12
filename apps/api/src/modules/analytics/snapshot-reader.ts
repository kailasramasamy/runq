import type { Db } from '@runq/db';
import type Redis from 'ioredis';
import type { FastifyBaseLogger } from 'fastify';
import { getSnapshot, type SnapshotRow } from './snapshot-store';
import { getRefresher } from './refresh-registry';
import { timed } from './timing';

/**
 * Read a snapshot. If it's missing (e.g. tenant hasn't been swept yet),
 * fall back to running the refresher inline so the first request doesn't
 * return empty. Subsequent reads hit the snapshot directly.
 */
export async function readOrCompute<T>(
  opts: {
    db: Db;
    redis: Redis;
    logger: Pick<FastifyBaseLogger, 'warn'>;
    tenantId: string;
    metricKey: string;
    period: string;
  },
): Promise<SnapshotRow<T> | null> {
  const existing = await getSnapshot<T>(opts.db, opts.tenantId, opts.metricKey, opts.period);
  if (existing) return existing;

  const refresher = getRefresher(opts.metricKey);
  if (!refresher) return null;
  await timed(opts.logger, `refresh_${opts.metricKey}`, () =>
    refresher.refresh({ db: opts.db, redis: opts.redis, tenantId: opts.tenantId, now: new Date() }),
  );
  return getSnapshot<T>(opts.db, opts.tenantId, opts.metricKey, opts.period);
}

export function istDateTag(d = new Date()): string {
  return new Date(d.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

export function istMonthTag(d = new Date()): string {
  return new Date(d.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 7);
}
