/**
 * Repairs the ledger's running-balance column after a backdated posting.
 *
 * `recordMovement` computes `running_qty` as on-hand-plus-delta at the moment
 * it writes, which is right for the cache but wrong for the column: a DN dated
 * two days ago and entered today lands *below* today's rows in every
 * date-ordered view, carrying a balance that was measured after them. The
 * trail then reads 67 → 62 → 25 → 5 with the 67 at the bottom, and the day
 * header's own arithmetic stops adding up.
 *
 * So whenever a row lands out of order, re-derive the whole chain for that
 * (item, warehouse, batch) as a plain cumulative sum in the order the trail
 * actually displays: IST calendar day of `moved_at`, then `posted_at`. Quantity
 * is order-independent in aggregate, so the last row still equals
 * `stock_on_hand.qty` — only the intermediate steps move.
 *
 * `running_value` is re-chained the same way from each row's recorded
 * `unit_cost`. It is a display figure; the authoritative valuation stays in
 * `stock_on_hand`, whose moving average is posting-order by nature and is
 * deliberately left untouched here. No GL, no COGS, no cache is rewritten.
 */

import { sql } from 'drizzle-orm';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = any;

export interface ChainKey {
  itemId: string;
  warehouseId: string;
  /** '' for non-batch items, matching the `stock_on_hand` convention. */
  batchKey: string;
}

/** The order the movement trail renders in — the chain must agree with it. */
const CHAIN_ORDER = sql`(moved_at AT TIME ZONE 'Asia/Kolkata')::date, posted_at, id`;

/** Rebuilds `running_qty` / `running_value` for one chain. */
export async function rechainRunningBalances(tx: Tx, tenantId: string, key: ChainKey) {
  await tx.execute(sql`
    WITH ordered AS (
      SELECT id,
             SUM(qty_in - qty_out) OVER w AS run_qty,
             SUM((qty_in - qty_out) * unit_cost) OVER w AS run_value
      FROM stock_ledger
      WHERE tenant_id = ${tenantId}
        AND item_id = ${key.itemId}
        AND warehouse_id = ${key.warehouseId}
        AND COALESCE(batch_no, '') = ${key.batchKey}
      WINDOW w AS (ORDER BY ${CHAIN_ORDER} ROWS UNBOUNDED PRECEDING)
    )
    UPDATE stock_ledger sl
       SET running_qty = o.run_qty, running_value = o.run_value
      FROM ordered o
     WHERE sl.id = o.id
       AND (sl.running_qty <> o.run_qty OR sl.running_value <> o.run_value)
  `);
}

/**
 * Re-chains only when the row just written does not sort last, which is the
 * ordinary case — a same-day posting leaves the chain already correct and
 * pays one cheap EXISTS instead of a windowed rewrite.
 */
export async function rechainIfBackdated(
  tx: Tx,
  tenantId: string,
  key: ChainKey,
  insertedId: string,
) {
  const res = await tx.execute(sql`
    SELECT EXISTS (
      SELECT 1
        FROM stock_ledger later, stock_ledger self
       WHERE self.id = ${insertedId}
         AND later.id <> self.id
         AND later.tenant_id = ${tenantId}
         AND later.item_id = ${key.itemId}
         AND later.warehouse_id = ${key.warehouseId}
         AND COALESCE(later.batch_no, '') = ${key.batchKey}
         AND ((later.moved_at AT TIME ZONE 'Asia/Kolkata')::date, later.posted_at, later.id)
           > ((self.moved_at  AT TIME ZONE 'Asia/Kolkata')::date, self.posted_at,  self.id)
    ) AS out_of_order
  `);
  const outOfOrder = (res as { rows: Array<{ out_of_order: boolean }> }).rows[0]?.out_of_order;
  if (outOfOrder) await rechainRunningBalances(tx, tenantId, key);
}
