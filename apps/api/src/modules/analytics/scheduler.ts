import { sql } from 'drizzle-orm';
import type { Db } from '@runq/db';
import type Redis from 'ioredis';
import { listRefreshers, getRefresher } from './refresh-registry';
import { registerAllRefreshers } from './snapshot-refreshers';

interface Logger {
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
}

const TICK_INTERVAL_MS = 60_000;
const NIGHTLY_HOUR_IST = 3;
const EVENT_QUEUE_KEY = 'analytics:refresh:queue';
const EVENT_POLL_INTERVAL_MS = 5_000;
const NIGHTLY_LOCK_TTL_SEC = 60 * 60 * 2;

let nightlyHandle: ReturnType<typeof setInterval> | null = null;
let eventHandle: ReturnType<typeof setInterval> | null = null;

export function startAnalyticsScheduler(db: Db, redis: Redis, logger: Logger = console): void {
  registerAllRefreshers();
  logger.info('Analytics scheduler: nightly sweep at 3 AM IST');
  nightlyHandle = setInterval(
    () => maybeRunNightly(db, redis, logger).catch((err) => logger.error('Analytics nightly error:', err)),
    TICK_INTERVAL_MS,
  );

  logger.info('Analytics scheduler: event queue poller started');
  eventHandle = setInterval(
    () => drainEventQueue(db, redis, logger).catch((err) => logger.error('Analytics event drain error:', err)),
    EVENT_POLL_INTERVAL_MS,
  );
}

export function stopAnalyticsScheduler(): void {
  if (nightlyHandle) { clearInterval(nightlyHandle); nightlyHandle = null; }
  if (eventHandle)   { clearInterval(eventHandle);   eventHandle = null; }
}

export async function enqueueRefresh(redis: Redis, tenantId: string, metricKey: string): Promise<void> {
  await redis.lpush(EVENT_QUEUE_KEY, JSON.stringify({ tenantId, metricKey, at: Date.now() }));
}

async function maybeRunNightly(db: Db, redis: Redis, logger: Logger): Promise<void> {
  const ist = istWallClock();
  if (ist.hour !== NIGHTLY_HOUR_IST || ist.minute >= 5) return;

  const dateTag = ist.dateTag;
  const lockKey = `analytics:lock:nightly:${dateTag}`;
  const acquired = await redis.set(lockKey, '1', 'EX', NIGHTLY_LOCK_TTL_SEC, 'NX');
  if (acquired !== 'OK') return;

  logger.info(`Analytics nightly sweep: ${dateTag}`);
  const tenants = await listActiveTenantIds(db);
  const refreshers = listRefreshers({ cadence: 'nightly' });

  const now = new Date();
  for (const tenantId of tenants) {
    for (const r of refreshers) {
      try {
        await r.refresh({ db, redis, tenantId, now });
      } catch (err) {
        logger.error(`Analytics refresh failed [${tenantId}/${r.metricKey}]:`, err);
      }
    }
  }
  logger.info(`Analytics nightly sweep: done (${tenants.length} tenants × ${refreshers.length} metrics)`);
}

async function drainEventQueue(db: Db, redis: Redis, logger: Logger): Promise<void> {
  for (let i = 0; i < 50; i++) {
    const raw = await redis.rpop(EVENT_QUEUE_KEY);
    if (!raw) return;
    let job: { tenantId: string; metricKey: string };
    try {
      job = JSON.parse(raw);
    } catch {
      logger.warn('Analytics event queue: dropping malformed job');
      continue;
    }
    const refresher = getRefresher(job.metricKey);
    if (!refresher) {
      logger.warn(`Analytics event queue: no refresher for ${job.metricKey}`);
      continue;
    }
    try {
      await refresher.refresh({ db, redis, tenantId: job.tenantId, now: new Date() });
    } catch (err) {
      logger.error(`Analytics event refresh failed [${job.tenantId}/${job.metricKey}]:`, err);
    }
  }
}

async function listActiveTenantIds(db: Db): Promise<string[]> {
  const res = await db.execute(sql`SELECT id FROM tenants WHERE deleted_at IS NULL`);
  const rows = (res as unknown as { rows: Array<{ id: string }> }).rows ?? [];
  return rows.map((r) => r.id);
}

function istWallClock(): { hour: number; minute: number; dateTag: string } {
  const ist = new Date(Date.now() + 5.5 * 3_600_000);
  return {
    hour: ist.getUTCHours(),
    minute: ist.getUTCMinutes(),
    dateTag: ist.toISOString().slice(0, 10),
  };
}
