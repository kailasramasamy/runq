import { eq, and, or, isNull, lte, gte, desc, sql } from 'drizzle-orm';
import { priceLists, priceListItems, customers, items } from '@runq/db';
import type { Db } from '@runq/db';
import { NotFoundError } from '../../utils/errors';

export type PriceSource = 'customer' | 'customer_group' | 'all' | 'item_default';

export interface ResolvedPrice {
  rate: number;
  effectiveRate: number;
  discountPercent: number | null;
  /**
   * Maximum retail price for this (customer, item) combination. Pulled from
   * the price list line if it has an mrp override; otherwise falls back to
   * items.mrp. Null if neither is set.
   */
  mrp: number | null;
  source: PriceSource;
  priceListId: string | null;
  priceListName: string | null;
}

export interface ResolveParams {
  customerId: string;
  itemId: string;
  quantity?: number;
  date?: string; // ISO date; defaults to today
}

/**
 * Picks the right unit price for a given (customer, item, quantity, date).
 *
 * Lookup order:
 *   1. Active selling price list with applyTo='customer'        + matching customerId
 *   2. Active selling price list with applyTo='customer_group'  + matching customerGroup
 *   3. Active selling price list with applyTo='all'
 *   4. items.defaultSellingPrice
 *
 * Within a matching list we pick the highest min_quantity row that is still
 * <= the requested quantity (qty tiers).
 *
 * A price list line can express its override three ways and any combination
 * is allowed (CHECK constraint guarantees at least one is set):
 *   - Absolute `rate`       → used as-is. Escape hatch for non-standard pricing.
 *   - `margin_percent`      → seller margin (discount off MRP), items-master flow.
 *   - `mrp`                 → MRP override.
 *
 * When `rate` is null we run the items-master MRP-anchored math:
 *
 *     effectiveMrp    = line.mrp           ?? item.mrp
 *     effectiveMargin = line.margin_percent ?? item.margin
 *     landingPrice    = effectiveMrp × (1 - effectiveMargin/100)
 *     rate            = landingPrice / (1 + item.gst_rate/100)
 *
 * If either MRP or margin is missing on both line and item, we fall through
 * to items.default_selling_price.
 *
 * `discount_percent` is then applied to the chosen rate to produce
 * `effectiveRate`. The resolved `mrp` is the price-list override if set,
 * otherwise the item master's mrp.
 */
export class PriceResolverService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async resolve(params: ResolveParams): Promise<ResolvedPrice> {
    const { customerId, itemId } = params;
    const quantity = params.quantity ?? 1;
    const today = params.date ?? new Date().toISOString().slice(0, 10);

    // Pull the customer once — we need its group for tier 2.
    const [customer] = await this.db
      .select({ customerGroup: customers.customerGroup })
      .from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.tenantId, this.tenantId)))
      .limit(1);

    if (!customer) throw new NotFoundError('Customer');

    // Tier 1: customer-specific
    const customerLevel = await this.findBestRate({
      itemId,
      quantity,
      today,
      where: and(
        eq(priceLists.applyTo, 'customer'),
        eq(priceLists.customerId, customerId),
      ),
    });
    if (customerLevel) return { ...customerLevel, source: 'customer' };

    // Tier 2: customer-group (only if the customer has a group set)
    if (customer.customerGroup) {
      const groupLevel = await this.findBestRate({
        itemId,
        quantity,
        today,
        where: and(
          eq(priceLists.applyTo, 'customer_group'),
          eq(priceLists.applyToValue, customer.customerGroup),
        ),
      });
      if (groupLevel) return { ...groupLevel, source: 'customer_group' };
    }

    // Tier 3: catch-all selling list
    const allLevel = await this.findBestRate({
      itemId,
      quantity,
      today,
      where: eq(priceLists.applyTo, 'all'),
    });
    if (allLevel) return { ...allLevel, source: 'all' };

    // Tier 4: fall back to the item master's default selling price + mrp
    const [item] = await this.db
      .select({
        defaultSellingPrice: items.defaultSellingPrice,
        mrp: items.mrp,
      })
      .from(items)
      .where(and(eq(items.id, itemId), eq(items.tenantId, this.tenantId)))
      .limit(1);

    if (!item) throw new NotFoundError('Item');

    const fallbackRate = item.defaultSellingPrice != null ? Number(item.defaultSellingPrice) : 0;
    return {
      rate: fallbackRate,
      effectiveRate: fallbackRate,
      discountPercent: null,
      mrp: item.mrp != null ? Number(item.mrp) : null,
      source: 'item_default',
      priceListId: null,
      priceListName: null,
    };
  }

  /**
   * Joins price_lists ↔ price_list_items ↔ items, filters to selling lists
   * for this tenant that are active, valid for the date, and have a row for
   * the item with min_quantity <= quantity. Picks the row with the highest
   * matching min_quantity (the right tier), then runs the items-master flow
   * to derive the rate.
   */
  private async findBestRate(args: {
    itemId: string;
    quantity: number;
    today: string;
    where: ReturnType<typeof and>;
  }): Promise<Omit<ResolvedPrice, 'source'> | null> {
    const { itemId, quantity, today, where } = args;

    const rows = await this.db
      .select({
        rate: priceListItems.rate,
        marginPercent: priceListItems.marginPercent,
        mrp: priceListItems.mrp,
        discountPercent: priceListItems.discountPercent,
        minQuantity: priceListItems.minQuantity,
        priceListId: priceLists.id,
        priceListName: priceLists.name,
        itemDefaultSellingPrice: items.defaultSellingPrice,
        itemMrp: items.mrp,
        itemMargin: items.margin,
        itemGstRate: items.gstRate,
      })
      .from(priceListItems)
      .innerJoin(priceLists, eq(priceListItems.priceListId, priceLists.id))
      .innerJoin(items, eq(priceListItems.itemId, items.id))
      .where(
        and(
          eq(priceLists.tenantId, this.tenantId),
          eq(priceLists.type, 'selling'),
          eq(priceLists.isActive, true),
          eq(priceListItems.itemId, itemId),
          or(isNull(priceLists.validFrom), lte(priceLists.validFrom, today)),
          or(isNull(priceLists.validTo), gte(priceLists.validTo, today)),
          or(isNull(priceListItems.minQuantity), lte(priceListItems.minQuantity, sql`${quantity}`)),
          where,
        ),
      )
      .orderBy(desc(priceListItems.minQuantity));

    const best = rows[0];
    if (!best) return null;

    let rate: number;
    if (best.rate != null) {
      // Explicit absolute override — escape hatch for non-standard pricing.
      rate = Number(best.rate);
    } else {
      // Items-master flow: derive basic price from effective MRP, margin, GST.
      const effectiveMrp =
        best.mrp != null ? Number(best.mrp) : (best.itemMrp != null ? Number(best.itemMrp) : null);
      const effectiveMargin =
        best.marginPercent != null
          ? Number(best.marginPercent)
          : (best.itemMargin != null ? Number(best.itemMargin) : null);
      const effectiveGst = best.itemGstRate != null ? Number(best.itemGstRate) : 0;

      if (effectiveMrp != null && effectiveMargin != null) {
        const landingPrice = effectiveMrp * (1 - effectiveMargin / 100);
        rate = landingPrice / (1 + effectiveGst / 100);
      } else {
        // Missing inputs for the MRP-anchored math — fall back to item default.
        rate = best.itemDefaultSellingPrice != null ? Number(best.itemDefaultSellingPrice) : 0;
      }
    }

    const discount = best.discountPercent != null ? Number(best.discountPercent) : null;
    const effectiveRate = discount != null ? rate * (1 - discount / 100) : rate;
    const mrp = best.mrp != null
      ? Number(best.mrp)
      : (best.itemMrp != null ? Number(best.itemMrp) : null);

    return {
      rate: Math.round(rate * 100) / 100,
      effectiveRate: Math.round(effectiveRate * 100) / 100,
      discountPercent: discount,
      mrp,
      priceListId: best.priceListId,
      priceListName: best.priceListName,
    };
  }
}
