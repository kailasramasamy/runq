/**
 * Shared SQL for stock alerts.
 *
 * One definition of "what counts as low / out of stock", used by the alert
 * list, the KPI counts, and the daily drift sweep — so the number in the
 * hero tile can never disagree with the list it links to.
 */

import { sql, type SQL } from 'drizzle-orm';

/**
 * How far back a movement counts as "we still stock this here".
 *
 * Without a window, every (item, warehouse) pair that ever held stock and
 * now sits at zero would report as out-of-stock forever — a tenant that
 * discontinued 400 SKUs would drown the real stockouts. A pair still
 * qualifies outside the window if it holds stock or has an explicit
 * reorder rule.
 */
export const RELEVANCE_WINDOW_DAYS = 90;

export type AlertStatus = 'ok' | 'low' | 'out';

/**
 * CTEs `alert_on_hand`, `alert_relevant` and `alert_base`, ready to be
 * prefixed with WITH. The helper names are namespaced so this fragment can
 * be composed into a WITH clause that already defines its own `on_hand`.
 *
 * `alert_base` yields one row per relevant (item, warehouse) with its
 * current qty, effective reorder level and derived status.
 */
export function alertBaseCte(tenantId: string, windowDays = RELEVANCE_WINDOW_DAYS): SQL {
  return sql`
    alert_on_hand AS (
      SELECT item_id, warehouse_id, SUM(qty) AS qty
      FROM stock_on_hand
      WHERE tenant_id = ${tenantId}
      GROUP BY item_id, warehouse_id
    ),
    alert_relevant AS (
      -- Touched recently: still part of the working assortment.
      SELECT DISTINCT item_id, warehouse_id
      FROM stock_ledger
      WHERE tenant_id = ${tenantId}
        AND moved_at >= NOW() - (${windowDays} || ' days')::interval
      UNION
      -- Explicitly configured: someone asked to be told about this pair.
      SELECT item_id, warehouse_id
      FROM inventory_reorder_rules
      WHERE tenant_id = ${tenantId}
      UNION
      -- Still holding stock: can't be discontinued if it's on the shelf.
      SELECT item_id, warehouse_id
      FROM alert_on_hand
      WHERE qty > 0
    ),
    alert_base AS (
      SELECT
        r.item_id,
        r.warehouse_id,
        i.name AS item_name,
        i.sku AS item_sku,
        i.unit AS item_unit,
        w.name AS warehouse_name,
        COALESCE(o.qty, 0) AS on_hand,
        COALESCE(rr.reorder_level, i.reorder_level) AS reorder_level,
        COALESCE(rr.reorder_qty, i.reorder_qty) AS reorder_qty,
        rr.lead_time_days,
        CASE
          WHEN COALESCE(o.qty, 0) <= 0 THEN 'out'
          WHEN COALESCE(rr.reorder_level, i.reorder_level) IS NOT NULL
           AND COALESCE(o.qty, 0) <= COALESCE(rr.reorder_level, i.reorder_level) THEN 'low'
          ELSE 'ok'
        END AS status
      FROM alert_relevant r
      INNER JOIN items i ON i.id = r.item_id
      INNER JOIN warehouses w ON w.id = r.warehouse_id
      LEFT JOIN alert_on_hand o
        ON o.item_id = r.item_id AND o.warehouse_id = r.warehouse_id
      LEFT JOIN inventory_reorder_rules rr
        ON rr.tenant_id = ${tenantId}
       AND rr.item_id = r.item_id
       AND rr.warehouse_id = r.warehouse_id
      WHERE i.is_active = TRUE
        AND i.track_inventory = TRUE
        AND w.is_active = TRUE
    )
  `;
}

/**
 * Effective status for a single (item, warehouse), used by edge detection
 * on the posting path. Deliberately mirrors the CASE in `alertBaseCte`.
 */
export function statusFor(onHand: number, reorderLevel: number | null): AlertStatus {
  if (onHand <= 0) return 'out';
  if (reorderLevel !== null && onHand <= reorderLevel) return 'low';
  return 'ok';
}

/** Rank used to decide whether a transition is a worsening one. */
const SEVERITY: Record<AlertStatus, number> = { ok: 0, low: 1, out: 2 };

/** True when moving from `prev` to `next` is a deterioration worth notifying. */
export function isWorsening(prev: AlertStatus, next: AlertStatus): boolean {
  return SEVERITY[next] > SEVERITY[prev];
}
