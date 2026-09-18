/**
 * When a batch first came into stock.
 *
 * Shared because two very different screens ask it: the on-hand list, which
 * sorts same-day intake by the order it actually arrived, and the WO consumed
 * section, where a bare consignment code says nothing about which milk is
 * older. Both want the same fact, so both read it the same way.
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import { stockLedger } from '@runq/db';
import type { Db } from '@runq/db';

export interface BatchKey {
  itemId: string;
  batchNo: string;
}

/**
 * The earliest inbound movement's post time per `(itemId, batchNo)`, keyed
 * `${itemId}|${batchNo}`.
 *
 * Post time rather than the movement's business date: an MP receipt stamps the
 * collection date, so every raw-milk batch would otherwise read 00:00 and two
 * tankers landing the same morning would be indistinguishable.
 *
 * Batched by design — callers hold a whole list of rows, and asking per batch
 * would be a query per line. An empty key list costs nothing.
 */
export async function batchReceivedMap(
  db: Db,
  tenantId: string,
  keys: readonly BatchKey[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (keys.length === 0) return out;
  const itemIds = Array.from(new Set(keys.map((k) => k.itemId)));
  const batchNos = Array.from(new Set(keys.map((k) => k.batchNo)));
  const rows = await db
    .select({
      itemId: stockLedger.itemId,
      batchNo: stockLedger.batchNo,
      receivedAt: sql<string>`MIN(${stockLedger.postedAt})`,
    })
    .from(stockLedger)
    .where(
      and(
        eq(stockLedger.tenantId, tenantId),
        inArray(stockLedger.itemId, itemIds),
        inArray(stockLedger.batchNo, batchNos),
        sql`${stockLedger.qtyIn} > 0`,
      ),
    )
    .groupBy(stockLedger.itemId, stockLedger.batchNo);
  for (const r of rows) {
    if (r.batchNo && r.receivedAt) out.set(`${r.itemId}|${r.batchNo}`, r.receivedAt);
  }
  return out;
}
