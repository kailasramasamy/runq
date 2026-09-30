/**
 * One-shot: price the variance on legs received before variance_value existed
 * (migration 0212). New receipts snapshot it themselves.
 *
 * Unit cost, in order: the raw-milk batch's own `unit_cost` where the receipt
 * posted one (the figure the plant's stock already carries), else
 * RawMilkCostService — the same basis receive() now uses. Dry run by default.
 *
 *   cd apps/api
 *   node --env-file=../../.env --import tsx src/scripts/backfill-mp-variance-value.ts [--apply]
 */

import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import { createDb, mpConsignments, stockLedger } from '@runq/db';
import type { MpConsignmentRow } from '@runq/db';
import { RawMilkCostService, varianceValuation } from '../modules/milk-procurement/raw-milk-cost';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const apply = process.argv.includes('--apply');
  const { db, pool } = createDb(url);

  const legs: MpConsignmentRow[] = await db.select().from(mpConsignments).where(and(
    eq(mpConsignments.status, 'received'),
    eq(mpConsignments.directReceive, false),
    isNull(mpConsignments.varianceUnitCost),
    ne(sql`coalesce(${mpConsignments.varianceQty}, 0)`, 0),
  ));

  let priced = 0; let unpriced = 0; let loss = 0;
  for (const c of legs) {
    const unitCost = await costFor(db, c);
    const v = varianceValuation(Number(c.varianceQty), unitCost);
    if (v.varianceValue == null) { unpriced += 1; continue; }
    priced += 1;
    loss += Number(v.varianceValue);
    console.log(`${c.consignmentNo} ${c.collectionDate} ${c.varianceQty} L × ₹${v.varianceUnitCost} = ₹${v.varianceValue}`);
    if (apply) {
      await db.update(mpConsignments).set(v).where(eq(mpConsignments.id, c.id));
    }
  }
  console.log(`\n${legs.length} legs · ${priced} priced · ${unpriced} unpriced · net ₹${loss.toFixed(2)}`);
  console.log(apply ? 'Applied.' : 'Dry run — re-run with --apply to write.');
  await pool.end();
}

async function costFor(db: ReturnType<typeof createDb>['db'], c: MpConsignmentRow): Promise<number> {
  if (c.stockLedgerId) {
    const [sl] = await db.select({ unitCost: stockLedger.unitCost }).from(stockLedger)
      .where(eq(stockLedger.id, c.stockLedgerId));
    if (Number(sl?.unitCost ?? 0) > 0) return Number(sl!.unitCost);
  }
  return new RawMilkCostService(c.tenantId).unitCost(db, c);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
