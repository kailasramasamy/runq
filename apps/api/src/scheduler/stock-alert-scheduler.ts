/**
 * Stock-alert scheduler.
 *
 * Two jobs on one timer:
 *
 *  1. DRAIN (every 5 min) — picks up `notify_pending` rows that
 *     `recordMovement` flagged inside a committed transaction and sends one
 *     digest per tenant. Draining out-of-band is what makes the notification
 *     safe: a rolled-back GRN leaves no committed row, so no phantom notice.
 *
 *  2. SWEEP (daily, 07:00 IST) — recomputes every pair's status from scratch.
 *     Movement-driven detection alone misses status changes with no movement:
 *     raising an item's reorder_level on the master puts stock below the line
 *     without a single ledger row. The sweep also repairs anything a
 *     best-effort in-transaction sync dropped.
 */

import { sql } from 'drizzle-orm';
import type { Db } from '@runq/db';
import type { Redis } from 'ioredis';
import { alertBaseCte } from '../modules/inventory/stock-alert.sql';
import {
  StockAlertNotifier,
  type PendingAlert,
} from '../modules/inventory/stock-alert-notifier';

interface Logger {
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
}

const INTERVAL_MS = 60_000;
/** Drain cadence — near-real-time without storming during bulk postings. */
const DRAIN_EVERY_MINUTES = 5;
const SWEEP_HOUR_IST = 7;
const SWEEP_MINUTE_IST = 0;

let handle: ReturnType<typeof setInterval> | null = null;
let lastSweptYmd: string | null = null;
let draining = false;

export function startStockAlertScheduler(db: Db, _redis: Redis, logger: Logger = console): void {
  logger.info(
    `Stock alert scheduler: started (drain every ${DRAIN_EVERY_MINUTES}m, sweep 07:00 IST)`,
  );

  handle = setInterval(async () => {
    try {
      const ist = nowIst();
      const ymd = `${ist.year}-${pad(ist.month)}-${pad(ist.date)}`;

      if (ist.hour === SWEEP_HOUR_IST && ist.minute === SWEEP_MINUTE_IST && lastSweptYmd !== ymd) {
        lastSweptYmd = ymd;
        await sweepAllTenants(db, logger);
      }

      // Guard against a slow drain overlapping the next tick and sending
      // the same rows twice.
      if (ist.minute % DRAIN_EVERY_MINUTES === 0 && !draining) {
        draining = true;
        try {
          await drainPending(db, logger);
        } finally {
          draining = false;
        }
      }
    } catch (err) {
      logger.error('Stock alert scheduler tick failed', err);
    }
  }, INTERVAL_MS);
}

export function stopStockAlertScheduler(): void {
  if (handle) {
    clearInterval(handle);
    handle = null;
  }
}

interface PendingRow {
  tenant_id: string;
  item_id: string;
  warehouse_id: string;
  item_name: string;
  warehouse_name: string;
  status: 'low' | 'out';
}

/**
 * Send one digest per tenant for everything flagged since the last drain,
 * then clear the flags.
 *
 * Flags are cleared per (tenant, item, warehouse) rather than with a blanket
 * tenant-wide update, so a transition committed while the digest was being
 * built survives to the next drain instead of being silently swallowed.
 */
export async function drainPending(db: Db, logger: Logger = console): Promise<void> {
  const result = await db.execute(sql`
    SELECT
      s.tenant_id, s.item_id, s.warehouse_id, s.status::text AS status,
      i.name AS item_name, w.name AS warehouse_name
    FROM inventory_stock_alert_state s
    INNER JOIN items i ON i.id = s.item_id
    INNER JOIN warehouses w ON w.id = s.warehouse_id
    WHERE s.notify_pending = TRUE
      AND s.status <> 'ok'
    ORDER BY s.tenant_id, CASE s.status WHEN 'out' THEN 0 ELSE 1 END, i.name
  `);
  const rows = (result as unknown as { rows: PendingRow[] }).rows;
  if (rows.length === 0) return;

  const byTenant = new Map<string, PendingRow[]>();
  for (const r of rows) {
    const list = byTenant.get(r.tenant_id);
    if (list) list.push(r);
    else byTenant.set(r.tenant_id, [r]);
  }

  for (const [tenantId, tenantRows] of byTenant) {
    try {
      const alerts: PendingAlert[] = tenantRows.map((r) => ({
        itemName: r.item_name,
        warehouseName: r.warehouse_name,
        status: r.status,
      }));
      await new StockAlertNotifier(db, tenantId).sendDigest(alerts);
      await clearFlags(db, tenantRows);
    } catch (err) {
      logger.error(`Stock alert digest failed for tenant ${tenantId}`, err);
    }
  }
  logger.info(`Stock alerts: drained ${rows.length} transition(s) across ${byTenant.size} tenant(s)`);
}

/** Clear `notify_pending` for exactly the rows that made it into the digest. */
async function clearFlags(db: Db, rows: PendingRow[]): Promise<void> {
  const pairs = sql.join(
    rows.map((r) => sql`(${r.item_id}::uuid, ${r.warehouse_id}::uuid)`),
    sql`, `,
  );
  await db.execute(sql`
    UPDATE inventory_stock_alert_state
    SET notify_pending = FALSE, notified_at = NOW()
    WHERE tenant_id = ${rows[0]!.tenant_id}
      AND (item_id, warehouse_id) IN (${pairs})
  `);
}

/** Recompute alert state for every tenant that holds stock. */
export async function sweepAllTenants(db: Db, logger: Logger = console): Promise<void> {
  const result = await db.execute(sql`
    SELECT DISTINCT tenant_id FROM stock_on_hand
  `);
  const tenantIds = (result as unknown as { rows: Array<{ tenant_id: string }> }).rows
    .map((r) => r.tenant_id);

  for (const tenantId of tenantIds) {
    try {
      await sweepTenant(db, tenantId);
    } catch (err) {
      logger.error(`Stock alert sweep failed for tenant ${tenantId}`, err);
    }
  }
  if (tenantIds.length) logger.info(`Stock alerts: swept ${tenantIds.length} tenant(s)`);
}

/**
 * Upsert the full status picture for one tenant. `notify_pending` is set
 * only where the recomputed status is strictly worse than what we last
 * recorded — the same worsening rule the posting path applies, so the
 * sweep can't re-announce a stockout that was already sent.
 */
export async function sweepTenant(db: Db, tenantId: string): Promise<void> {
  await db.execute(sql`
    WITH ${alertBaseCte(tenantId)},
    ranked AS (
      SELECT
        b.item_id, b.warehouse_id, b.on_hand, b.reorder_level, b.status,
        COALESCE(s.status::text, 'ok') AS prev_status,
        COALESCE(s.notify_pending, FALSE) AS prev_pending,
        CASE b.status WHEN 'out' THEN 2 WHEN 'low' THEN 1 ELSE 0 END AS new_rank,
        CASE COALESCE(s.status::text, 'ok') WHEN 'out' THEN 2 WHEN 'low' THEN 1 ELSE 0 END AS prev_rank
      FROM alert_base b
      LEFT JOIN inventory_stock_alert_state s
        ON s.tenant_id = ${tenantId}
       AND s.item_id = b.item_id
       AND s.warehouse_id = b.warehouse_id
    )
    INSERT INTO inventory_stock_alert_state (
      tenant_id, item_id, warehouse_id, status, on_hand, threshold,
      status_changed_at, notify_pending
    )
    SELECT
      ${tenantId}, r.item_id, r.warehouse_id, r.status::stock_alert_status,
      r.on_hand, r.reorder_level, NOW(),
      r.prev_pending OR r.new_rank > r.prev_rank
    FROM ranked r
    ON CONFLICT (tenant_id, item_id, warehouse_id) DO UPDATE SET
      status = EXCLUDED.status,
      on_hand = EXCLUDED.on_hand,
      threshold = EXCLUDED.threshold,
      status_changed_at = CASE
        WHEN inventory_stock_alert_state.status <> EXCLUDED.status
          THEN NOW() ELSE inventory_stock_alert_state.status_changed_at
      END,
      notify_pending = EXCLUDED.notify_pending,
      updated_at = NOW()
  `);
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
