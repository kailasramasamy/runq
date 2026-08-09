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

export type PoolBucket = 'uncapitalised' | 'capitalised' | 'mixed';

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
}

export interface ZeroOutBucketSummary {
  pools: number;
  qty: number;
  value: number;
}

export class StockResetService {
  constructor(private readonly ctx: Ctx) {}

  /**
   * One row per on-hand pool in the warehouse, with the inbound ledger volume
   * attributed to uncapitalised vs capitalised sources so each pool can be
   * bucketed.
   */
  private async pools(query: ZeroOutPreviewQuery) {
    const result = await this.ctx.db.execute(sql`
      SELECT
        s.item_id, s.batch_no, i.name AS item_name, i.sku AS item_sku,
        s.qty::text AS qty, s.avg_cost::text AS avg_cost, s.value::text AS value,
        COALESCE(SUM(l.qty_in) FILTER (
          WHERE l.source_type IN (${sql.join(UNCAPITALISED_SOURCES.map((s2) => sql`${s2}`), sql`, `)})
        ), 0)::text AS uncapitalised_in,
        COALESCE(SUM(l.qty_in) FILTER (
          WHERE l.source_type NOT IN (${sql.join(UNCAPITALISED_SOURCES.map((s2) => sql`${s2}`), sql`, `)})
        ), 0)::text AS capitalised_in
      FROM stock_on_hand s
      INNER JOIN items i ON i.id = s.item_id
      LEFT JOIN stock_ledger l
        ON l.tenant_id = s.tenant_id
       AND l.item_id = s.item_id
       AND l.warehouse_id = s.warehouse_id
       AND COALESCE(l.batch_no, '') = s.batch_no
       AND l.qty_in > 0
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

  async preview(query: ZeroOutPreviewQuery): Promise<{
    lines: ZeroOutLine[];
    summary: Record<PoolBucket, ZeroOutBucketSummary>;
  }> {
    const rows = await this.pools(query);

    const lines = rows.map<ZeroOutLine>((r) => {
      const qty = Number(r.qty);
      return {
        itemId: r.item_id,
        itemName: r.item_name,
        itemSku: r.item_sku,
        batchNo: r.batch_no === '' ? null : r.batch_no,
        qty,
        avgCost: Number(r.avg_cost),
        value: Number(r.value),
        qtyDelta: -qty,
        bucket: bucketFor(Number(r.uncapitalised_in), Number(r.capitalised_in)),
      };
    });

    const summary: Record<PoolBucket, ZeroOutBucketSummary> = {
      uncapitalised: { pools: 0, qty: 0, value: 0 },
      capitalised: { pools: 0, qty: 0, value: 0 },
      mixed: { pools: 0, qty: 0, value: 0 },
    };
    for (const l of lines) {
      const b = summary[l.bucket];
      b.pools += 1;
      b.qty += l.qty;
      b.value += l.value;
    }
    return { lines, summary };
  }
}

/**
 * A pool fed only by MP receipts has no GL asset behind it; one fed by any
 * other source does. A pool fed by both can't be split by a single `postGl`
 * flag, so it is surfaced as `mixed` for the user to resolve rather than
 * silently guessed at.
 */
function bucketFor(uncapitalisedIn: number, capitalisedIn: number): PoolBucket {
  if (uncapitalisedIn > 0 && capitalisedIn > 0) return 'mixed';
  if (uncapitalisedIn > 0) return 'uncapitalised';
  return 'capitalised';
}
