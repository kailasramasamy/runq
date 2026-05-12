import type { Db } from '@runq/db';
import type Redis from 'ioredis';

export interface RefreshContext {
  db: Db;
  redis: Redis;
  tenantId: string;
  now: Date;
}

export interface MetricRefresher {
  metricKey: string;
  cadence: 'nightly' | 'weekly' | 'monthly';
  refresh(ctx: RefreshContext): Promise<void>;
}

const refreshers = new Map<string, MetricRefresher>();

export function registerRefresher(r: MetricRefresher): void {
  refreshers.set(r.metricKey, r);
}

export function getRefresher(metricKey: string): MetricRefresher | undefined {
  return refreshers.get(metricKey);
}

export function listRefreshers(filter?: { cadence?: MetricRefresher['cadence'] }): MetricRefresher[] {
  const all = Array.from(refreshers.values());
  if (!filter?.cadence) return all;
  return all.filter((r) => r.cadence === filter.cadence);
}
