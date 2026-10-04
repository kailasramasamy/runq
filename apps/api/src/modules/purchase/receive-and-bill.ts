import { and, eq, inArray, sql } from 'drizzle-orm';
import { purchaseOrdersV2, inventoryGrns, vendorCatalogItems } from '@runq/db';
import type { Db } from '@runq/db';
import type { Redis } from 'ioredis';
import type { ReceiveAgainstPoInput, ScanReceiveAgainstPoInput } from '@runq/validators';
import { ValidationError } from '../../utils/errors';
import { ScanReceiveService } from './scan-receive.service';
import type { ResolvedReceiveInput } from './receive.service';

const r2 = (n: number) => Math.round(n * 100) / 100;

/** "Net 30" → 30 days after [from]; anything else → due on [from]. */
export function dueFrom(from: string, terms: string | null): string {
  const days = Number(/(\d+)/.exec(terms ?? '')?.[1] ?? 0);
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Receive with rates and bill it in the same step — the rates are the price,
 * no vendor invoice will follow. Reuses the scan-receive path (receipt +
 * approved bill + stock + one Dr Inventory / Cr AP entry), feeding it the
 * receipt's own lines instead of a scanned invoice. [lines] must already be
 * PO-linked with catalog rows (see receive-extra-items).
 */
export async function receiveAndBill(
  db: Db, redis: Redis, tenantId: string, userId: string, poId: string,
  input: ReceiveAgainstPoInput, lines: ResolvedReceiveInput['lines'],
) {
  const unpriced = lines.find((l) => !(Number(l.unitCost) > 0));
  if (unpriced) throw new ValidationError('Enter a rate for every item to create the bill');
  const [po] = await db.select({ poNumber: purchaseOrdersV2.poNumber, terms: purchaseOrdersV2.paymentTerms })
    .from(purchaseOrdersV2).where(and(eq(purchaseOrdersV2.id, poId), eq(purchaseOrdersV2.tenantId, tenantId)));
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(inventoryGrns)
    .where(and(eq(inventoryGrns.tenantId, tenantId), eq(inventoryGrns.poId, poId)));
  const catalog = await db.select({ id: vendorCatalogItems.id, tax: vendorCatalogItems.defaultTaxRate, hsn: vendorCatalogItems.hsnSacCode })
    .from(vendorCatalogItems).where(inArray(vendorCatalogItems.id, lines.map((l) => l.catalogItemId)));
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const scanLines = lines.map((l) => {
    const c = byId.get(l.catalogItemId);
    return {
      poLineId: l.poLineId, catalogItemId: l.catalogItemId, qty: l.qty, unitRate: Number(l.unitCost),
      taxRate: c?.tax != null ? Number(c.tax) : null, hsnSacCode: c?.hsn ?? null,
      batchNo: l.batchNo ?? null, mfgDate: l.mfgDate ?? null, expiryDate: l.expiryDate ?? null,
      serialNos: l.serialNos ?? null, notes: l.notes ?? null,
    };
  });
  const subtotal = r2(scanLines.reduce((s, l) => s + l.qty * l.unitRate, 0));
  const taxAmount = r2(scanLines.reduce((s, l) => s + (l.qty * l.unitRate * (l.taxRate ?? 0)) / 100, 0));
  const scanInput: ScanReceiveAgainstPoInput = {
    warehouseId: input.warehouseId, receivedDate: input.receivedDate,
    vehicleNo: input.vehicleNo ?? null, lrNo: input.lrNo ?? null, notes: input.notes ?? null,
    vendorInvoice: {
      // No vendor invoice exists — the bill is numbered after the receipt.
      invoiceNumber: `${po!.poNumber}-R${(n ?? 0) + 1}`,
      invoiceDate: input.receivedDate,
      dueDate: dueFrom(input.receivedDate, po!.terms),
      subtotal, taxAmount, totalAmount: r2(subtotal + taxAmount),
    },
    lines: scanLines,
  };
  return new ScanReceiveService(db, redis, tenantId, userId).commitScan(poId, scanInput);
}
