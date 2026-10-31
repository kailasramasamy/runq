/**
 * Product price revision for the 1 Nov 2026 farmer rate hike — plan in
 * docs/product-price-revision-nov-2026.md.
 *
 * Every A1/A2 product's landing price (incl. GST) rises by the milk it holds
 * × ₹8/L: the increase lands on the pre-GST basic price and GST is charged on
 * the new basic. MRP rises by the same rupees (whole rupees, rounded down), so
 * the consumer pays the same ₹8/L more and the retailer keeps its ₹ margin; the
 * margin % is re-derived so MRP × (1 − margin) still lands on the new price.
 * Price-list lines get their MRP and margin explicitly so none drifts with the
 * item's. cost_price rises by the
 * milk × ₹7/L farmer increase. Buffalo items are untouched.
 *
 * Items carry no effective date, so this must run after the 31 Oct invoices
 * are raised (they are created the night after, or the next morning) — the
 * script refuses until they exist and have stopped arriving, unless --force.
 * Re-runnable: an item whose landing price is no longer the old one is skipped.
 *
 * Run dry:   tsx --env-file=../../.env src/scripts/apply-dairy-price-revision-nov2026.ts
 * Run apply: tsx --env-file=../../.env src/scripts/apply-dairy-price-revision-nov2026.ts --apply
 */

import { and, eq, sql } from 'drizzle-orm';
import { createDb, items, priceListItems, priceLists } from '@runq/db';
import type { Db } from '@runq/db';

const TENANT_ID = 'a0365382-afa0-48b6-92cd-4db615a7d98b';
const PRICE_PER_LITRE = 8;
const COST_PER_LITRE = 7;
const LAST_OLD_PRICE_DAY = '2026-10-31';
/** No new invoice for this long = the day's batch is done. */
const QUIET_MINUTES = 20;

/** Litres of milk in each pack, and its landing price before the revision. */
const SKUS: Record<string, { litres: number; oldLanding: number }> = {
  'A1-MILK-500ML': { litres: 0.5, oldLanding: 27.00 },
  'A2-MILK-500ML': { litres: 0.5, oldLanding: 35.25 },
  'A1-CURD-400G': { litres: 0.4, oldLanding: 33.75 },
  'A2-CURD-400G': { litres: 0.4, oldLanding: 48.75 },
  'A1-PANEER-200G': { litres: 1.4, oldLanding: 90.00 },
  'A1-PANEER-500G': { litres: 3.5, oldLanding: 246.75 },
  'A2-PANEER-200G': { litres: 1.4, oldLanding: 130.50 },
  'A2-PANEER-500G': { litres: 3.5, oldLanding: 344.25 },
  'A1-GHEE-100G': { litres: 3, oldLanding: 99.20 },
  'COW-GHEE-200G': { litres: 6, oldLanding: 215.20 },
  'A1-GHEE-500G': { litres: 15, oldLanding: 399.20 },
  'A2-GHEE-200G': { litres: 6, oldLanding: 399.20 },
  'A2-GHEE-500G': { litres: 15, oldLanding: 959.20 },
  'A2-BUTTER-200G': { litres: 5, oldLanding: 343.20 },
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const n = (v: string | null) => (v == null ? null : Number(v));

/** New landing for an old one: milk × ₹8 on the basic, GST on the new basic. */
function revisedLanding(oldLanding: number, litres: number, gstRate: number) {
  const basic = round2(oldLanding / (1 + gstRate / 100) + litres * PRICE_PER_LITRE);
  const landing = round2(basic * (1 + gstRate / 100));
  return { basic, landing, gst: gstRate > 0 ? round2(landing - basic) : null };
}

/** MRP up by the landing increase in whole rupees; margin re-derived to land on the new price. */
function revisedMrp(oldMrp: number, oldLanding: number, newLanding: number) {
  const mrp = oldMrp + Math.floor(newLanding - oldLanding + 1e-9);
  const margin = round2((1 - newLanding / mrp) * 100);
  return { mrp, margin, drift: round2(mrp * (1 - margin / 100) - newLanding) };
}

async function invoicesSettled(db: Db): Promise<boolean> {
  const res = await db.execute(sql`
    SELECT count(*)::int AS n, coalesce(extract(epoch FROM now() - max(created_at)) / 60, 0) AS quiet
    FROM sales_invoices WHERE tenant_id = ${TENANT_ID} AND invoice_date = ${LAST_OLD_PRICE_DAY}`);
  const r = (res as unknown as { rows: { n: number; quiet: string }[] }).rows[0]!;
  console.log(`${r.n} invoices dated ${LAST_OLD_PRICE_DAY}, last one ${Math.round(Number(r.quiet))} min ago`);
  return r.n > 0 && Number(r.quiet) >= QUIET_MINUTES;
}

async function reviseLines(tx: Db, item: typeof items.$inferSelect, litres: number, apply: boolean) {
  const lines = await tx.select({ id: priceListItems.id, list: priceLists.name, mrp: priceListItems.mrp,
    margin: priceListItems.marginPercent, rate: priceListItems.rate })
    .from(priceListItems).innerJoin(priceLists, eq(priceLists.id, priceListItems.priceListId))
    .where(and(eq(priceLists.tenantId, TENANT_ID), eq(priceListItems.itemId, item.id)));
  for (const l of lines) {
    const mrp = n(l.mrp) ?? n(item.mrp);
    const margin = n(l.margin) ?? n(item.margin);
    if (l.rate != null || mrp == null || margin == null) {
      console.log(`  ${l.list}: fixed rate or no MRP/margin — left as is`);
      continue;
    }
    const oldLanding = round2(mrp * (1 - margin / 100));
    const next = revisedLanding(oldLanding, litres, Number(item.gstRate ?? 0));
    const r = revisedMrp(mrp, oldLanding, next.landing);
    console.log(`  ${l.list}: MRP ${mrp} → ${r.mrp}, margin ${margin}% → ${r.margin}%, landing ${oldLanding} → ${next.landing} (drift ${r.drift})`);
    if (apply) {
      await tx.update(priceListItems).set({ mrp: String(r.mrp), marginPercent: String(r.margin), updatedAt: new Date() })
        .where(eq(priceListItems.id, l.id));
    }
  }
}

async function reviseItem(tx: Db, sku: string, apply: boolean) {
  const { litres, oldLanding } = SKUS[sku]!;
  const [item] = await tx.select().from(items).where(and(eq(items.tenantId, TENANT_ID), eq(items.sku, sku)));
  if (!item) return console.log(`${sku}: not found — skipped`);
  if (Number(item.defaultSellingPrice) !== oldLanding) {
    return console.log(`${sku}: landing is ${item.defaultSellingPrice}, not ${oldLanding} — already revised, skipped`);
  }
  // Lines first: they read the item's current MRP/margin as their fallback.
  console.log(`${sku}`);
  await reviseLines(tx, item, litres, apply);
  const next = revisedLanding(oldLanding, litres, Number(item.gstRate ?? 0));
  const r = revisedMrp(Number(item.mrp), oldLanding, next.landing);
  const newCost = round2(Number(item.costPrice ?? 0) + litres * COST_PER_LITRE);
  console.log(`  Master: landing ${oldLanding} → ${next.landing} (basic ${next.basic}, GST ${next.gst ?? 0}), MRP ${item.mrp} → ${r.mrp} (margin ${item.margin}% → ${r.margin}%), cost ${item.costPrice} → ${newCost}`);
  if (!apply) return;
  await tx.update(items).set({
    defaultSellingPrice: String(next.landing), basicPrice: String(next.basic),
    gstValue: next.gst == null ? null : String(next.gst), mrp: String(r.mrp), margin: String(r.margin),
    costPrice: String(newCost), updatedAt: new Date(),
  }).where(eq(items.id, item.id));
}

async function main() {
  const apply = process.argv.includes('--apply');
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const { db, pool } = createDb(url);
  console.log(apply ? '🔧 APPLY MODE' : '🔍 DRY RUN');
  const settled = await invoicesSettled(db);
  if (apply && !settled && !process.argv.includes('--force')) {
    console.log(`⏸  ${LAST_OLD_PRICE_DAY} invoices not raised yet (or still arriving) — nothing changed. Re-run later.`);
    await pool.end();
    process.exit(2);
  }
  await db.transaction(async (tx) => {
    for (const sku of Object.keys(SKUS)) await reviseItem(tx as unknown as Db, sku, apply);
  });
  console.log(apply ? '✅ applied' : 'dry run — re-run with --apply');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
