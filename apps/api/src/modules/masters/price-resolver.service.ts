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

/** The price-list line fields that participate in rate derivation. */
export interface PriceLineInputs {
  rate: string | number | null;
  marginPercent: string | number | null;
  mrp: string | number | null;
  discountPercent: string | number | null;
}

/** The item-master fallbacks the line derives against. */
export interface PriceItemInputs {
  defaultSellingPrice: string | number | null;
  mrp: string | number | null;
  margin: string | number | null;
  gstRate: string | number | null;
}

const num = (v: string | number | null): number | null => (v == null ? null : Number(v));
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Derive the unit rate a single price-list line resolves to.
 *
 * Shared by the resolver (which picks one winning line) and by the
 * per-item price-list listing (which shows every line), so the price a
 * user reads on an item can never disagree with the price an invoice
 * actually uses.
 */
export function derivePriceLineRate(
  line: PriceLineInputs,
  item: PriceItemInputs,
): { rate: number; effectiveRate: number; discountPercent: number | null; mrp: number | null } {
  let rate: number;
  const lineRate = num(line.rate);
  if (lineRate != null) {
    // Explicit absolute override — escape hatch for non-standard pricing.
    rate = lineRate;
  } else {
    // Items-master flow: derive basic price from effective MRP, margin, GST.
    const effectiveMrp = num(line.mrp) ?? num(item.mrp);
    const effectiveMargin = num(line.marginPercent) ?? num(item.margin);
    const effectiveGst = num(item.gstRate) ?? 0;

    if (effectiveMrp != null && effectiveMargin != null) {
      const landingPrice = effectiveMrp * (1 - effectiveMargin / 100);
      rate = landingPrice / (1 + effectiveGst / 100);
    } else {
      // Missing inputs for the MRP-anchored math — fall back to item default.
      rate = num(item.defaultSellingPrice) ?? 0;
    }
  }

  const discount = num(line.discountPercent);
  const effectiveRate = discount != null ? rate * (1 - discount / 100) : rate;
  return {
    rate: round2(rate),
    effectiveRate: round2(effectiveRate),
    discountPercent: discount,
    mrp: num(line.mrp) ?? num(item.mrp),
  };
}

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

    // Tier 4: fall back to the item master's default selling price + mrp.
    // `default_selling_price` is stored as the landing (incl-GST) price the
    // customer pays — back out the base rate so the resolver is consistent
    // with Tiers 1-3, where invoice math expects rate to be excl-GST.
    const [item] = await this.db
      .select({
        defaultSellingPrice: items.defaultSellingPrice,
        basicPrice: items.basicPrice,
        gstRate: items.gstRate,
        mrp: items.mrp,
      })
      .from(items)
      .where(and(eq(items.id, itemId), eq(items.tenantId, this.tenantId)))
      .limit(1);

    if (!item) throw new NotFoundError('Item');

    let fallbackRate = 0;
    if (item.basicPrice != null) {
      fallbackRate = Number(item.basicPrice);
    } else if (item.defaultSellingPrice != null) {
      const gst = item.gstRate != null ? Number(item.gstRate) : 0;
      fallbackRate = Number(item.defaultSellingPrice) / (1 + gst / 100);
    }
    fallbackRate = Math.round(fallbackRate * 100) / 100;
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
        applyToValue: priceLists.applyToValue,
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

    const derived = derivePriceLineRate(best, {
      defaultSellingPrice: best.itemDefaultSellingPrice,
      mrp: best.itemMrp,
      margin: best.itemMargin,
      gstRate: best.itemGstRate,
    });

    return {
      ...derived,
      priceListId: best.priceListId,
      // For group-level price lists, show the group name ("bigbasket")
      // rather than the price list's internal name ("BB Daily") — the
      // group name is what the user recognises in the invoice form.
      priceListName: best.applyToValue || best.priceListName,
    };
  }
}
