/**
 * Zero-out preview — builds the adjustment lines that would flatten a
 * warehouse's on-hand to nil, split by whether the GL ever capitalised the
 * stock.
 *
 * The split is per *pool* (item + warehouse + batch), not per item. The same
 * raw-milk item holds both `mp_receipt` batches (posted to the ledger with a
 * pour-derived cost but no journal entry — docs/dhenu-raw-milk-valuation.md §3)
 * and `reclaim_in` / `grn` batches that were properly capitalised. Writing the
 * first group off with a JE would credit an asset that was never debited and
 * expense the milk twice; writing the second group off without one would strand
 * the asset. So they belong on two adjustments with different `postGl`.
 *
 * A single pool can be fed by BOTH kinds of source — an MP batch that someone
 * later corrected with a manual adjustment, say. Such a pool used to be
 * surfaced as an unresolvable "mixed" bucket for the user to sort out by hand.
 * It is now split into two lines automatically; see `splitPool`.
 *
 * This service only reads. The caller posts through the normal
 * AdjustmentService flow, which keeps approval, GL and audit behaviour intact.
 */

import { sql } from 'drizzle-orm';
import type { Db } from '@runq/db';
import type { ZeroOutPreviewQuery } from '@runq/validators';

interface Ctx { db: Db; tenantId: string }

/**
 * Ledger sources that write stock without a matching GL debit. Keep in step
 * with ConsignmentService.postRawMilkReceipt / adjustRawMilkStock.
 */
const UNCAPITALISED_SOURCES = ['mp_receipt', 'mp_receipt_adjustment'];

export type PoolBucket = 'uncapitalised' | 'capitalised';

export interface ZeroOutLine {
  itemId: string;
  itemName: string;
  itemSku: string | null;
  batchNo: string | null;
  qty: number;
  avgCost: number;
  value: number;
  /** Adjustment line delta — always the negation of on-hand qty. */
  qtyDelta: number;
  bucket: PoolBucket;
  /**
   * True when this line is one half of a pool fed by both kinds of source.
   * The UI says so, because the batch number appears twice in the dialog and
   * that looks like a duplicate otherwise.
   */
  splitFromMixed: boolean;
}

export interface ZeroOutBucketSummary {
  pools: number;
  qty: number;
  value: number;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const r2 = (n: number) => Math.round(n * 100) / 100;

export interface LedgerMove {
  /** Positive on the way in, zero on the way out. */
  qtyIn: number;
  qtyOut: number;
  sourceType: string;
}

/**
 * How much of a pool's remaining stock belongs to each bucket.
 *
 * Inflows are classed by source: MP receipts write stock the GL never
 * debited, everything else was capitalised on arrival. Outflows are then
 * consumed FIFO — earliest layer first — because nothing records which layer
 * a given withdrawal actually drew from, and within a single batch arrival
 * order is the only ordering that exists.
 *
 * Attributing an outflow by its OWN source type does not work: a work order
 * consuming MP milk is not an `mp_receipt` movement, so it would be counted
 * against the capitalised layer and wipe out a real GL asset. That mistake
 * is what this replay replaces.
 *
 * `journal_entry_id` on the ledger row would be the ideal signal, but
 * several capitalising writers (direct receipt, scan receive, production
 * output, transfers) never populate it, so it cannot be trusted here.
 */
export function splitPool(moves: LedgerMove[]): {
  capitalised: number;
  uncapitalised: number;
} {
  const layers: Array<{ qty: number; capitalised: boolean }> = [];

  for (const m of moves) {
    if (m.qtyIn > 0) {
      layers.push({
        qty: m.qtyIn,
        capitalised: !UNCAPITALISED_SOURCES.includes(m.sourceType),
      });
    }
    let out = m.qtyOut;
    while (out > 0 && layers.length > 0) {
      const head = layers[0];
      const take = Math.min(head.qty, out);
      head.qty = r3(head.qty - take);
      out = r3(out - take);
      if (head.qty <= 0) layers.shift();
    }
  }

  let capitalised = 0;
  let uncapitalised = 0;
  for (const l of layers) {
    if (l.capitalised) capitalised = r3(capitalised + l.qty);
    else uncapitalised = r3(uncapitalised + l.qty);
  }
  return { capitalised, uncapitalised };
}

export class StockResetService {
  constructor(private readonly ctx: Ctx) {}

  /**
   * One row per on-hand pool in the warehouse. The two inflow sums only
   * classify the pool — a pool fed by both needs the ordered replay in
   * `moves()` to apportion it.
   */
  private async pools(query: ZeroOutPreviewQuery) {
    const uncap = sql.join(UNCAPITALISED_SOURCES.map((s) => sql`${s}`), sql`, `);
    const result = await this.ctx.db.execute(sql`
      SELECT
        s.item_id, s.batch_no, i.name AS item_name, i.sku AS item_sku,
        s.qty::text AS qty, s.avg_cost::text AS avg_cost, s.value::text AS value,
        COALESCE(SUM(l.qty_in)  FILTER (WHERE l.source_type IN (${uncap})), 0)::text AS uncapitalised_in,
        COALESCE(SUM(l.qty_in)  FILTER (WHERE l.source_type NOT IN (${uncap})), 0)::text AS capitalised_in
      FROM stock_on_hand s
      INNER JOIN items i ON i.id = s.item_id
      LEFT JOIN stock_ledger l
        ON l.tenant_id = s.tenant_id
       AND l.item_id = s.item_id
       AND l.warehouse_id = s.warehouse_id
       AND COALESCE(l.batch_no, '') = s.batch_no
      WHERE s.tenant_id = ${this.ctx.tenantId}
        AND s.warehouse_id = ${query.warehouseId}
        AND s.qty <> 0
        ${query.itemClass ? sql`AND i.item_class = ${query.itemClass}` : sql``}
        ${query.itemIds?.length
          ? sql`AND s.item_id IN (${sql.join(query.itemIds.map((id) => sql`${id}`), sql`, `)})`
          : sql``}
      GROUP BY s.item_id, s.batch_no, i.name, i.sku, s.qty, s.avg_cost, s.value
      ORDER BY i.name, s.batch_no
    `);
    return (result as unknown as {
      rows: Array<{
        item_id: string; batch_no: string; item_name: string; item_sku: string | null;
        qty: string; avg_cost: string; value: string;
        uncapitalised_in: string; capitalised_in: string;
      }>;
    }).rows;
  }

  /**
   * Ordered movements for the given pools, oldest first. Only fetched for
   * pools fed by both kinds of source, which is a small minority.
   *
   * Ordered by `moved_at` then `posted_at`: back-dated corrections carry the
   * business date they apply to, and that is the order stock actually moved
   * in. `posted_at` breaks ties for same-day movements.
   */
  private async moves(query: ZeroOutPreviewQuery, keys: Array<{ itemId: string; batchNo: string }>) {
    const pairs = sql.join(
      keys.map((k) => sql`(${k.itemId}::uuid, ${k.batchNo})`),
      sql`, `,
    );
    const result = await this.ctx.db.execute(sql`
      SELECT l.item_id, COALESCE(l.batch_no, '') AS batch_no, l.source_type,
             l.qty_in::text AS qty_in, l.qty_out::text AS qty_out
      FROM stock_ledger l
      WHERE l.tenant_id = ${this.ctx.tenantId}
        AND l.warehouse_id = ${query.warehouseId}
        AND (l.item_id, COALESCE(l.batch_no, '')) IN (${pairs})
      ORDER BY l.moved_at, l.posted_at
    `);
    const rows = (result as unknown as {
      rows: Array<{ item_id: string; batch_no: string; source_type: string; qty_in: string; qty_out: string }>;
    }).rows;
    const byPool = new Map<string, LedgerMove[]>();
    for (const r of rows) {
      const k = `${r.item_id}|${r.batch_no}`;
      const list = byPool.get(k) ?? [];
      list.push({ qtyIn: Number(r.qty_in), qtyOut: Number(r.qty_out), sourceType: r.source_type });
      byPool.set(k, list);
    }
    return byPool;
  }

  async preview(query: ZeroOutPreviewQuery): Promise<{
    lines: ZeroOutLine[];
    summary: Record<PoolBucket, ZeroOutBucketSummary>;
  }> {
    const rows = await this.pools(query);
    const mixedKeys = rows
      .filter((r) => Number(r.uncapitalised_in) > 0 && Number(r.capitalised_in) > 0)
      .map((r) => ({ itemId: r.item_id, batchNo: r.batch_no }));
    const movesByPool = mixedKeys.length > 0
      ? await this.moves(query, mixedKeys)
      : new Map<string, LedgerMove[]>();
    const lines: ZeroOutLine[] = [];

    for (const r of rows) {
      const qty = Number(r.qty);
      const avgCost = Number(r.avg_cost);
      const value = Number(r.value);
      const base = {
        itemId: r.item_id,
        itemName: r.item_name,
        itemSku: r.item_sku,
        batchNo: r.batch_no === '' ? null : r.batch_no,
        avgCost,
      };

      const uncapitalisedIn = Number(r.uncapitalised_in);
      const capitalisedIn = Number(r.capitalised_in);

      // Fed by one kind of source only — the common case, one line.
      if (uncapitalisedIn === 0 || capitalisedIn === 0) {
        lines.push({
          ...base,
          qty,
          value,
          qtyDelta: -qty,
          bucket: uncapitalisedIn > 0 ? 'uncapitalised' : 'capitalised',
          splitFromMixed: false,
        });
        continue;
      }

      const share = splitPool(movesByPool.get(`${r.item_id}|${r.batch_no}`) ?? []);

      // A share can land on zero — an adjustment that was fully reversed
      // leaves nothing capitalised. Emitting a zero-qty line would put an
      // empty row in the dialog and a no-op line on the adjustment.
      //
      // A capitalised share worth nothing is folded back too: the GL poster
      // short-circuits on a zero delta, so the split would produce no journal
      // entry while parking the batch under "posts GL" and alarming the user.
      const capValue = r2(share.capitalised * avgCost);
      if (share.capitalised > 0 && capValue !== 0) {
        lines.push({
          ...base,
          qty: share.capitalised,
          value: capValue,
          qtyDelta: -share.capitalised,
          bucket: 'capitalised',
          splitFromMixed: true,
        });
        if (share.uncapitalised > 0) {
          lines.push({
            ...base,
            qty: share.uncapitalised,
            // Complement, so the two halves reconcile to the pool's value
            // exactly rather than drifting by a rounded paisa.
            value: r2(value - capValue),
            qtyDelta: -share.uncapitalised,
            bucket: 'uncapitalised',
            splitFromMixed: true,
          });
        }
        continue;
      }

      lines.push({
        ...base,
        qty,
        value,
        qtyDelta: -qty,
        bucket: 'uncapitalised',
        splitFromMixed: false,
      });
    }

    const summary: Record<PoolBucket, ZeroOutBucketSummary> = {
      uncapitalised: { pools: 0, qty: 0, value: 0 },
      capitalised: { pools: 0, qty: 0, value: 0 },
    };
    for (const l of lines) {
      const b = summary[l.bucket];
      b.pools += 1;
      b.qty = r3(b.qty + l.qty);
      b.value = r2(b.value + l.value);
    }
    return { lines, summary };
  }
}
