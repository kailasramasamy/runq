/**
 * Stock-alert edge detection.
 *
 * Called from `recordMovement` inside the caller's transaction. It re-reads
 * the item+warehouse total (movements are per-batch, alerts are per-item),
 * derives the new status and upserts the state row — flagging
 * `notify_pending` only when the status WORSENS.
 *
 * Nothing is sent from here. A rolled-back GRN must not leave a phantom
 * "out of stock" notice in someone's inbox, so the actual send is drained
 * out-of-band by the stock-alert scheduler once the row is committed.
 */

import { sql } from 'drizzle-orm';
import { statusFor, isWorsening, type AlertStatus } from './stock-alert.sql';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = any;

/**
 * Re-evaluate one (item, warehouse) pair and record the transition.
 *
 * Best-effort by design: an alerting failure must never roll back a posted
 * stock movement, so the caller wraps this in a catch. Any state missed
 * here is repaired by the scheduler's daily sweep.
 */
export async function syncAlertState(
  tx: Tx,
  tenantId: string,
  itemId: string,
  warehouseId: string,
): Promise<AlertStatus | null> {
  const evaluated = await evaluate(tx, tenantId, itemId, warehouseId);
  if (!evaluated) return null;
  const { onHand, reorderLevel, prevStatus } = evaluated;
  const status = statusFor(onHand, reorderLevel);
  const changed = status !== prevStatus;
  const notify = changed && isWorsening(prevStatus, status);

  await tx.execute(sql`
    INSERT INTO inventory_stock_alert_state (
      tenant_id, item_id, warehouse_id, status, on_hand, threshold,
      status_changed_at, notify_pending
    ) VALUES (
      ${tenantId}, ${itemId}, ${warehouseId}, ${status}, ${onHand},
      ${reorderLevel}, NOW(), ${notify}
    )
    ON CONFLICT (tenant_id, item_id, warehouse_id) DO UPDATE SET
      status = EXCLUDED.status,
      on_hand = EXCLUDED.on_hand,
      threshold = EXCLUDED.threshold,
      status_changed_at = CASE
        WHEN inventory_stock_alert_state.status <> EXCLUDED.status
          THEN NOW() ELSE inventory_stock_alert_state.status_changed_at
      END,
      -- Never clear a flag the scheduler hasn't drained yet: an item that
      -- dips out and is topped back up within one tick still deserves the
      -- notice that was already earned.
      notify_pending = inventory_stock_alert_state.notify_pending OR ${notify},
      updated_at = NOW()
  `);

  return status;
}

interface Evaluation {
  onHand: number;
  reorderLevel: number | null;
  prevStatus: AlertStatus;
}

/** Current total, effective threshold and last-known status, in one round trip. */
async function evaluate(
  tx: Tx,
  tenantId: string,
  itemId: string,
  warehouseId: string,
): Promise<Evaluation | null> {
  const result = await tx.execute(sql`
    SELECT
      COALESCE((
        SELECT SUM(qty) FROM stock_on_hand
        WHERE tenant_id = ${tenantId}
          AND item_id = ${itemId}
          AND warehouse_id = ${warehouseId}
      ), 0)::text AS on_hand,
      COALESCE(
        (SELECT reorder_level FROM inventory_reorder_rules
          WHERE tenant_id = ${tenantId}
            AND item_id = ${itemId}
            AND warehouse_id = ${warehouseId}),
        i.reorder_level
      )::text AS reorder_level,
      COALESCE((
        SELECT status::text FROM inventory_stock_alert_state
        WHERE tenant_id = ${tenantId}
          AND item_id = ${itemId}
          AND warehouse_id = ${warehouseId}
      ), 'ok') AS prev_status
    FROM items i
    WHERE i.id = ${itemId}
      AND i.tenant_id = ${tenantId}
      AND i.is_active = TRUE
      AND i.track_inventory = TRUE
  `);
  const row = (result as { rows: Array<{
    on_hand: string; reorder_level: string | null; prev_status: AlertStatus;
  }> }).rows[0];
  if (!row) return null;
  return {
    onHand: Number(row.on_hand),
    reorderLevel: row.reorder_level === null ? null : Number(row.reorder_level),
    prevStatus: row.prev_status,
  };
}
