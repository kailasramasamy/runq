import { eq, and, asc, sql } from 'drizzle-orm';
import { priceLists, priceListItems, items, customers, vendors } from '@runq/db';
import type { Db } from '@runq/db';
import type { ItemPriceListLine } from '@runq/types';
import { NotFoundError } from '../../utils/errors';
import { derivePriceLineRate } from './price-resolver.service';

/**
 * Every price-list line that covers one item, flattened with the list it
 * belongs to and the party it applies to.
 *
 * The resolver answers "what does THIS customer pay?" for one (customer,
 * item, qty). This answers the inverse — "who has a negotiated price for
 * this item, and what is it?" — which is what the item detail view needs.
 * Rates run through the same derivePriceLineRate() the resolver uses, so
 * the number shown here is the number an invoice would pick up.
 *
 * Kept out of ItemService because that file is already oversized; this is
 * a self-contained read.
 */
export class ItemPriceListService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async listForItem(itemId: string): Promise<ItemPriceListLine[]> {
    const [item] = await this.db
      .select({
        defaultSellingPrice: items.defaultSellingPrice,
        mrp: items.mrp,
        margin: items.margin,
        gstRate: items.gstRate,
        costPrice: items.costPrice,
      })
      .from(items)
      .where(and(eq(items.id, itemId), eq(items.tenantId, this.tenantId)))
      .limit(1);

    if (!item) throw new NotFoundError('Item');

    const rows = await this.db
      .select({
        line: priceListItems,
        pl: priceLists,
        customerName: customers.name,
        vendorName: vendors.name,
      })
      .from(priceListItems)
      .innerJoin(priceLists, eq(priceListItems.priceListId, priceLists.id))
      .leftJoin(customers, eq(priceLists.customerId, customers.id))
      .leftJoin(vendors, eq(priceLists.vendorId, vendors.id))
      .where(
        and(
          eq(priceListItems.itemId, itemId),
          eq(priceLists.tenantId, this.tenantId),
        ),
      )
      // Named parties first, then groups, then catch-all lists — the same
      // precedence the resolver applies, so the list reads top-down as
      // "most specific price wins".
      .orderBy(
        sql`CASE ${priceLists.applyTo}
          WHEN 'customer' THEN 1 WHEN 'vendor' THEN 1
          WHEN 'customer_group' THEN 2 WHEN 'vendor_group' THEN 2
          ELSE 3 END`,
        asc(priceLists.name),
        asc(priceListItems.minQuantity),
      );

    const today = new Date().toISOString().slice(0, 10);

    const itemGst = item.gstRate != null ? Number(item.gstRate) : 0;
    const itemCost = item.costPrice != null ? Number(item.costPrice) : null;
    const round2 = (n: number) => Math.round(n * 100) / 100;

    return rows.map(({ line, pl, customerName, vendorName }) => {
      const derived = derivePriceLineRate(line, item);
      // Tax rides on the post-discount rate, which is what gets invoiced.
      const gstAmount = round2(derived.effectiveRate * (itemGst / 100));
      // Profit only makes sense on what we sell; on a buying list this rate
      // is what we pay out.
      const sells = pl.type === 'selling';
      const profit =
        sells && itemCost != null ? round2(derived.effectiveRate - itemCost) : null;
      return {
        priceListId: pl.id,
        priceListName: pl.name,
        type: pl.type,
        applyTo: pl.applyTo,
        applyToValue: pl.applyToValue,
        partyName: customerName ?? vendorName ?? null,
        validFrom: pl.validFrom,
        validTo: pl.validTo,
        isActive: pl.isActive,
        isExpired:
          (pl.validFrom != null && pl.validFrom > today) ||
          (pl.validTo != null && pl.validTo < today),
        minQuantity: Number(line.minQuantity),
        rate: line.rate != null ? Number(line.rate) : null,
        marginPercent: line.marginPercent != null ? Number(line.marginPercent) : null,
        mrp: line.mrp != null ? Number(line.mrp) : null,
        discountPercent: derived.discountPercent,
        derivedRate: derived.rate,
        effectiveRate: derived.effectiveRate,
        gstRatePct: itemGst,
        gstAmount,
        landingRate: round2(derived.effectiveRate + gstAmount),
        effectiveMarginPct:
          line.marginPercent != null
            ? Number(line.marginPercent)
            : item.margin != null
              ? Number(item.margin)
              : null,
        netProfitPerUnit: profit,
        netMarginPct:
          profit != null && derived.effectiveRate > 0
            ? round2((profit / derived.effectiveRate) * 100)
            : null,
      };
    });
  }
}
