import { and, eq, inArray, max } from 'drizzle-orm';
import { purchaseOrdersV2, purchaseOrderLinesV2, vendorCatalogItems } from '@runq/db';
import type { Db } from '@runq/db';
import type { ReceiveAgainstPoInput } from '@runq/validators';
import { ConflictError, NotFoundError } from '../../utils/errors';
import { ReceiveService, type ResolvedReceiveInput } from './receive.service';
import { VendorCatalogService } from '../ap/vendor-catalog.service';
import { receiveAndBill } from './receive-and-bill';
import type { Redis } from 'ioredis';

/**
 * Receive against a PO. In one transaction: free-text lines get a vendor
 * catalog row, each item the vendor added on the spot becomes a new PO line
 * (ordered = received), then the whole receipt goes through the normal
 * receive path, which bumps the received counters and re-derives the PO
 * status — or, when the receipt is priced (`createBill`), the receive-and-bill
 * path. Nothing is saved if any part fails.
 */
export async function receiveWithExtras(
  db: Db, redis: Redis, tenantId: string, userId: string, poId: string, input: ReceiveAgainstPoInput,
) {
  return db.transaction(async (tx) => {
    const txDb = tx as unknown as Db;
    const linked = await linkCatalog(txDb, tenantId, poId, input.lines);
    const added = input.extraItems.length ? await appendLines(txDb, tenantId, poId, input.extraItems) : [];
    const lines = [...linked, ...added];
    if (input.createBill) return receiveAndBill(txDb, redis, tenantId, userId, poId, input, lines);
    return new ReceiveService(txDb, tenantId, userId).receive(poId, { ...input, lines, extraItems: [] });
  });
}

/**
 * Receiving needs a vendor catalog row per line. A line typed as free text on
 * the PO has none, so find the vendor's matching entry by description (or
 * create it) and link the PO line to it — instead of dropping the line.
 */
async function linkCatalog(db: Db, tenantId: string, poId: string, lines: ReceiveAgainstPoInput['lines']) {
  const missing = lines.filter((l) => !l.catalogItemId);
  if (!missing.length) return lines as ResolvedReceiveInput['lines'];
  const [po] = await db.select({ vendorId: purchaseOrdersV2.vendorId }).from(purchaseOrdersV2)
    .where(and(eq(purchaseOrdersV2.id, poId), eq(purchaseOrdersV2.tenantId, tenantId)));
  if (!po) throw new NotFoundError('PurchaseOrder');
  const poLines = await db.select().from(purchaseOrderLinesV2).where(and(
    eq(purchaseOrderLinesV2.poId, poId),
    inArray(purchaseOrderLinesV2.id, missing.map((l) => l.poLineId)),
  ));
  const byId = new Map(poLines.map((l) => [l.id, l]));
  const catalog = new VendorCatalogService(db, tenantId);
  const resolved = new Map<string, string>();
  for (const m of missing) {
    const pl = byId.get(m.poLineId);
    if (!pl) throw new ConflictError(`PO line ${m.poLineId} does not belong to this PO`);
    const id = pl.catalogItemId ?? (await catalog.upsertFromDocLine(po.vendorId, {
      description: pl.description, uom: pl.uom, hsnSacCode: pl.hsnSacCode,
    })).id;
    if (!pl.catalogItemId) {
      await db.update(purchaseOrderLinesV2).set({ catalogItemId: id }).where(eq(purchaseOrderLinesV2.id, pl.id));
    }
    resolved.set(m.poLineId, id);
  }
  return lines.map((l) => ({ ...l, catalogItemId: l.catalogItemId ?? resolved.get(l.poLineId)! }));
}

async function appendLines(db: Db, tenantId: string, poId: string, extras: ReceiveAgainstPoInput['extraItems']) {
  const [po] = await db.select({ vendorId: purchaseOrdersV2.vendorId }).from(purchaseOrdersV2)
    .where(and(eq(purchaseOrdersV2.id, poId), eq(purchaseOrdersV2.tenantId, tenantId)));
  if (!po) throw new NotFoundError('PurchaseOrder');
  const catalog = await db.select().from(vendorCatalogItems).where(and(
    eq(vendorCatalogItems.tenantId, tenantId),
    inArray(vendorCatalogItems.id, extras.map((e) => e.catalogItemId)),
  ));
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const [{ last } = { last: 0 }] = await db.select({ last: max(purchaseOrderLinesV2.lineNo) })
    .from(purchaseOrderLinesV2).where(eq(purchaseOrderLinesV2.poId, poId));
  let lineNo = last ?? 0;
  const out = [];
  for (const e of extras) {
    const c = byId.get(e.catalogItemId);
    if (!c) throw new NotFoundError(`Catalog item ${e.catalogItemId}`);
    if (c.vendorId !== po.vendorId) throw new ConflictError(`"${c.description}" is another vendor's item`);
    const rate = e.unitCost ?? Number(c.defaultRate ?? 0);
    const [line] = await db.insert(purchaseOrderLinesV2).values({
      tenantId, poId, lineNo: ++lineNo,
      description: c.description, catalogItemId: c.id, uom: c.defaultUom, hsnSacCode: c.hsnSacCode,
      qtyOrdered: String(e.qty), unitRate: String(rate), amount: String(rate * e.qty),
      notes: 'Added at receipt',
    }).returning({ id: purchaseOrderLinesV2.id });
    out.push({ ...e, poLineId: line!.id });
  }
  return out;
}
