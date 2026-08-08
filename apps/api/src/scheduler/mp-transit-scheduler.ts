/**
 * Milk-procurement stale-in-transit scheduler.
 *
 * Runs daily at 06:00 IST. Any consignment still `in_transit` more than
 * STALE_AFTER_DAYS after its collection date pings the destination node's
 * operators — ONE digest per node, not one per load.
 *
 * This exists because dispatch-time notification alone is not enough: 91
 * consignments sat unreceived for six weeks with nobody ever asked again. The
 * digest keeps asking until the queue is empty, which is the only thing that
 * would have surfaced that backlog.
 *
 * Re-fires daily by design — an unreceived load is a standing problem, and the
 * digest collapses to a single push per node, so the cost of repeating is one
 * notification a day until the operator clears it. Idempotency is therefore not
 * needed: nothing is written to the domain, only notifications.
 */

import { and, eq, lt, sql } from 'drizzle-orm';
import type { Db } from '@runq/db';
import { mpConsignments } from '@runq/db';
import type { Redis } from 'ioredis';
import { MpNotifier } from '../modules/milk-procurement/mp-notifier';

interface Logger {
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
}

const INTERVAL_MS = 60_000;
// 06:00 IST — after the 04:00 cycle roll, before the morning collection round.
const FIRE_HOUR_IST = 6;
const FIRE_MINUTE_IST = 0;
/** A load dispatched today and received tomorrow is normal; three days is not. */
const STALE_AFTER_DAYS = 2;

let handle: ReturnType<typeof setInterval> | null = null;
let lastFiredYmd: string | null = null;

export function startMpTransitScheduler(db: Db, _redis: Redis, logger: Logger = console): void {
  logger.info('MP stale-in-transit scheduler: started (runs daily at 06:00 IST)');

  handle = setInterval(async () => {
    try {
      const ist = nowIst();
      if (ist.hour !== FIRE_HOUR_IST || ist.minute !== FIRE_MINUTE_IST) return;
      const ymd = `${ist.year}-${pad(ist.month)}-${pad(ist.date)}`;
      if (lastFiredYmd === ymd) return;
      lastFiredYmd = ymd;
      await notifyStale(db, ymd, logger);
    } catch (err) {
      logger.error('MP stale-in-transit scheduler tick failed', err);
    }
  }, INTERVAL_MS);
}

export function stopMpTransitScheduler(): void {
  if (handle) {
    clearInterval(handle);
    handle = null;
  }
}

/** One digest per (tenant, destination node) holding stale loads. */
export async function notifyStale(db: Db, today: string, logger: Logger = console): Promise<void> {
  const cutoff = isoDaysBefore(today, STALE_AFTER_DAYS);
  const rows = await db
    .select({
      tenantId: mpConsignments.tenantId,
      nodeId: mpConsignments.toNodeId,
      count: sql<number>`count(*)::int`,
      litres: sql<string>`coalesce(sum(${mpConsignments.dispatchQty}), 0)`,
      oldest: sql<string>`min(${mpConsignments.collectionDate})`,
    })
    .from(mpConsignments)
    .where(and(
      eq(mpConsignments.status, 'in_transit'),
      lt(mpConsignments.collectionDate, cutoff),
    ))
    .groupBy(mpConsignments.tenantId, mpConsignments.toNodeId);

  for (const r of rows) {
    try {
      await new MpNotifier(db, r.tenantId)
        .staleInTransit(r.nodeId, r.count, Number(r.litres), r.oldest);
    } catch (err) {
      logger.error(`MP stale-in-transit digest failed for node ${r.nodeId}`, err);
    }
  }
  if (rows.length) logger.info(`MP stale-in-transit: notified ${rows.length} node(s)`);
}

/** ISO `yyyy-mm-dd` [days] before [iso]. */
function isoDaysBefore(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function nowIst(): { year: number; month: number; date: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { year: get('year'), month: get('month'), date: get('day'), hour: get('hour'), minute: get('minute') };
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
