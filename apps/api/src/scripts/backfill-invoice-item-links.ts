/**
 * One-shot backfill: walk sales_invoice_items where item_id is null, look up
 * an active item with a matching name (case-insensitive, trimmed) in the same
 * tenant, and set item_id + uom from the master. Idempotent and safe to re-run
 * — only touches rows where item_id is still null.
 *
 *   cd apps/api
 *   node --env-file=../../.env --import tsx src/scripts/backfill-invoice-item-links.ts
 */

import { eq, and, isNull, sql } from 'drizzle-orm';
import { createDb, salesInvoiceItems, items } from '@runq/db';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const { db, pool } = createDb(url);

  // Pull all invoice line items with no item_id, grouped by tenant for fast
  // lookup against the items master.
  const orphaned = await db
    .select({
      id: salesInvoiceItems.id,
      tenantId: salesInvoiceItems.tenantId,
      description: salesInvoiceItems.description,
      uom: salesInvoiceItems.uom,
    })
    .from(salesInvoiceItems)
    .where(isNull(salesInvoiceItems.itemId));

  console.log(`Found ${orphaned.length} unlinked invoice line items`);

  // Per-tenant items lookup, keyed by lowercased trimmed name.
  const tenantItemsCache = new Map<string, Map<string, { id: string; unit: string | null }>>();

  async function getTenantItemMap(tenantId: string) {
    const cached = tenantItemsCache.get(tenantId);
    if (cached) return cached;
    const rows = await db
      .select({ id: items.id, name: items.name, unit: items.unit })
      .from(items)
      .where(and(eq(items.tenantId, tenantId), eq(items.isActive, true)));
    const map = new Map<string, { id: string; unit: string | null }>();
    for (const r of rows) {
      map.set(r.name.trim().toLowerCase(), { id: r.id, unit: r.unit });
    }
    tenantItemsCache.set(tenantId, map);
    return map;
  }

  let linked = 0;
  let unmatched = 0;
  for (const line of orphaned) {
    const map = await getTenantItemMap(line.tenantId);
    const key = line.description.trim().toLowerCase();
    const match = map.get(key);
    if (!match) {
      unmatched += 1;
      continue;
    }
    await db
      .update(salesInvoiceItems)
      .set({
        itemId: match.id,
        // Borrow UOM from the master if the line didn't have one already.
        ...(line.uom ? {} : { uom: match.unit ?? null }),
        updatedAt: new Date(),
      })
      .where(eq(salesInvoiceItems.id, line.id));
    linked += 1;
  }

  console.log(`\nLinked: ${linked}`);
  console.log(`Unmatched (no items master entry by name): ${unmatched}`);

  // Quick verification — count remaining unlinked
  const [remaining] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(salesInvoiceItems)
    .where(isNull(salesInvoiceItems.itemId));
  console.log(`Remaining unlinked rows: ${remaining?.n ?? 0}`);

  await pool.end();
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
