import { eq, and, ilike, or, sql, gte, lte } from 'drizzle-orm';
import { items, priceListItems, salesInvoices, salesInvoiceItems, tenants } from '@runq/db';
import type { Db } from '@runq/db';
import type { Item, ItemAttributeSchema, TenantSettings } from '@runq/types';
import type { CreateItemInput, UpdateItemInput, ItemFilterInput } from '@runq/validators';
import { getItemAttributeSchemaForIndustry } from '@runq/validators';
import { applyPagination, calcTotalPages } from '@runq/db';
import type { PaginationMeta } from '@runq/types';
import { ConflictError, NotFoundError } from '../../utils/errors';
import { toNumber } from '../../utils/decimal';
import { defaultPackSize } from '../gst/hsn-canonical-uqc';

/** Resolve pack_size_value/uqc for a create input. Defaults from HSN
 *  family so GSTR-1 reports in canonical LTR/KGS without manual setup. */
function resolvePackSizeForCreate(input: CreateItemInput): { packSizeValue: string; packSizeUqc: string } {
  const def = defaultPackSize(input.hsnSacCode, input.unit);
  return {
    packSizeValue: (input.packSizeValue ?? def.packSizeValue).toString(),
    packSizeUqc: input.packSizeUqc ?? def.packSizeUqc,
  };
}

export interface ItemListParams {
  page: number;
  limit: number;
  filters: ItemFilterInput;
}

export interface ItemListResult {
  data: Item[];
  meta: PaginationMeta;
}

export interface SalesAnalyticsRow {
  itemId: string;
  name: string;
  type: 'product' | 'service';
  unit: string | null;
  revenue: number;
  quantity: number;
  profit: number | null;
  marginPct: number | null;
}

export interface SalesAnalyticsResult {
  periodDays: number;
  from: string;
  to: string;
  revenueMix: { product: number; service: number };
  topByRevenue: SalesAnalyticsRow[];
  topByMargin: SalesAnalyticsRow[];
}

export class ItemService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async list(params: ItemListParams): Promise<ItemListResult> {
    const { page, limit, filters } = params;
    const { offset } = applyPagination(page, limit);

    // Per-word AND so a query like "A2 Cow Milk" matches "Cow Milk A2 1L"
    // regardless of word order. Each word matches name OR sku.
    const searchTerms = (filters.search ?? '')
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    const searchClause = searchTerms.length > 0
      ? and(
          ...searchTerms.map((term) =>
            or(ilike(items.name, `%${term}%`), ilike(items.sku, `%${term}%`)),
          ),
        )
      : undefined;

    const baseWhere = and(
      eq(items.tenantId, this.tenantId),
      searchClause,
      filters.type ? eq(items.type, filters.type) : undefined,
      filters.category ? eq(items.category, filters.category) : undefined,
      filters.subcategory ? eq(items.subcategory, filters.subcategory) : undefined,
    );

    const [rows, countResult] = await Promise.all([
      this.db.select().from(items).where(baseWhere).orderBy(items.name).limit(limit).offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(items).where(baseWhere),
    ]);

    const total = countResult[0]?.count ?? 0;
    return {
      data: rows.map((r) => this.toItem(r)),
      meta: { page, limit, total, totalPages: calcTotalPages(total, limit) },
    };
  }

  async getById(id: string): Promise<Item> {
    const [row] = await this.db
      .select()
      .from(items)
      .where(and(eq(items.id, id), eq(items.tenantId, this.tenantId)))
      .limit(1);

    if (!row) throw new NotFoundError('Item');
    return this.toItem(row);
  }

  async create(input: CreateItemInput): Promise<Item> {
    const values = {
      ...input,
      tenantId: this.tenantId,
      attributes: input.attributes ?? null,
      defaultSellingPrice: input.defaultSellingPrice?.toString() ?? null,
      defaultPurchasePrice: input.defaultPurchasePrice?.toString() ?? null,
      gstRate: input.gstRate?.toString() ?? null,
      mrp: input.mrp?.toString() ?? null,
      costPrice: input.costPrice?.toString() ?? null,
      margin: input.margin?.toString() ?? null,
      basicPrice: input.basicPrice?.toString() ?? null,
      gstValue: input.gstValue?.toString() ?? null,
      ...resolvePackSizeForCreate(input),
    };

    const [row] = await this.db.insert(items).values(values).returning();
    return this.toItem(row!);
  }

  async update(id: string, input: UpdateItemInput): Promise<Item> {
    const set: Record<string, unknown> = {
      ...input,
      updatedAt: new Date(),
    };
    // Decimal columns must round-trip as strings; null clears the field.
    const decimalKeys = [
      'defaultSellingPrice',
      'defaultPurchasePrice',
      'gstRate',
      'mrp',
      'costPrice',
      'margin',
      'basicPrice',
      'gstValue',
      'packSizeValue',
    ] as const;
    for (const key of decimalKeys) {
      if (input[key] !== undefined) {
        set[key] = input[key]?.toString() ?? null;
      }
    }

    const [row] = await this.db
      .update(items)
      .set(set)
      .where(and(eq(items.id, id), eq(items.tenantId, this.tenantId)))
      .returning();

    if (!row) throw new NotFoundError('Item');
    return this.toItem(row);
  }

  async toggleActive(id: string): Promise<Item> {
    const existing = await this.getById(id);
    const [row] = await this.db
      .update(items)
      .set({ isActive: !existing.isActive, updatedAt: new Date() })
      .where(and(eq(items.id, id), eq(items.tenantId, this.tenantId)))
      .returning();

    if (!row) throw new NotFoundError('Item');
    return this.toItem(row);
  }

  /**
   * Returns the tenant's catalogue attribute schema. If the tenant has no
   * schema yet (first access post-signup, or pre-Phase-1 tenants), seeds
   * it from the industry preset and persists it back into
   * tenants.settings.itemAttributeSchema so subsequent reads hit the
   * stored copy.
   *
   * A persisted copy (rather than always returning the preset on the fly)
   * is the foundation for the tenant-editable schema — once the schema
   * is stored, the Settings page can mutate it per tenant.
   */
  async getAttributeSchema(): Promise<ItemAttributeSchema> {
    const [row] = await this.db
      .select({ settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, this.tenantId))
      .limit(1);
    if (!row) throw new NotFoundError('Tenant');

    const settings = (row.settings ?? {}) as Partial<TenantSettings>;
    if (settings.itemAttributeSchema && settings.itemAttributeSchema.length > 0) {
      return settings.itemAttributeSchema;
    }

    const seeded = getItemAttributeSchemaForIndustry(settings.industry);
    const merged = { ...settings, itemAttributeSchema: seeded };
    await this.db
      .update(tenants)
      .set({ settings: merged, updatedAt: new Date() })
      .where(eq(tenants.id, this.tenantId));

    return seeded;
  }

  /**
   * Replaces the tenant's item attribute schema wholesale. Validation
   * (key uniqueness, allowed field shapes) happens in the route zod
   * parser; this method only handles persistence.
   *
   * NOTE: renaming a key in the schema does NOT rename it inside any
   * existing items.attributes rows — those values will silently become
   * stale orphans. If the UI supports rename, it should surface a
   * warning. Phase 3 will add a rename-with-backfill flow.
   */
  async updateAttributeSchema(schema: ItemAttributeSchema): Promise<ItemAttributeSchema> {
    const [row] = await this.db
      .select({ settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, this.tenantId))
      .limit(1);
    if (!row) throw new NotFoundError('Tenant');

    const settings = (row.settings ?? {}) as Partial<TenantSettings>;
    const merged = { ...settings, itemAttributeSchema: schema };
    await this.db
      .update(tenants)
      .set({ settings: merged, updatedAt: new Date() })
      .where(eq(tenants.id, this.tenantId));

    return schema;
  }

  /**
   * Sales-driven analytics rolled up by item over a recent date window.
   * Joins sales_invoice_items → sales_invoices (for the date filter) →
   * items (for type, name, and cost), then groups by item.
   *
   * Returns three views:
   *   - revenueMix: total revenue split by item.type (product vs service)
   *   - topByRevenue: top 10 items by gross revenue
   *   - topByMargin: top 10 items by margin %, where the item has a
   *                  costPrice set (otherwise we can't compute margin)
   *
   * Profit math is intentionally simple: revenue − (costPrice × qty).
   * This treats item.costPrice as a per-unit cost snapshot at "today",
   * not a historical cost — close enough for a quick analytics view
   * and deliberately doesn't try to be a full COGS engine.
   *
   * Excludes draft and cancelled invoices so the numbers reflect
   * realised sales, not in-progress quotes.
   */
  async getSalesAnalytics(periodDays: number): Promise<SalesAnalyticsResult> {
    const safeDays = Number.isFinite(periodDays) && periodDays > 0 ? Math.min(periodDays, 366) : 90;
    const fromDate = new Date();
    fromDate.setUTCDate(fromDate.getUTCDate() - safeDays);
    const fromIso = fromDate.toISOString().slice(0, 10);
    const toIso = new Date().toISOString().slice(0, 10);

    // Aggregate revenue + qty per item, joined via the invoice for date filter
    // and item type. ad-hoc invoice lines (item_id IS NULL) are excluded —
    // they have no master record so we can't classify or compute margin.
    const rows = await this.db
      .select({
        itemId: salesInvoiceItems.itemId,
        itemName: items.name,
        itemType: items.type,
        itemCostPrice: items.costPrice,
        unit: items.unit,
        revenue: sql<string>`COALESCE(SUM(${salesInvoiceItems.amount}), 0)`,
        quantity: sql<string>`COALESCE(SUM(${salesInvoiceItems.quantity}), 0)`,
      })
      .from(salesInvoiceItems)
      .innerJoin(salesInvoices, eq(salesInvoiceItems.invoiceId, salesInvoices.id))
      .innerJoin(items, eq(salesInvoiceItems.itemId, items.id))
      .where(
        and(
          eq(salesInvoices.tenantId, this.tenantId),
          gte(salesInvoices.invoiceDate, fromIso),
          lte(salesInvoices.invoiceDate, toIso),
          // Only count realised sales — drafts and cancellations don't
          // represent actual revenue.
          sql`${salesInvoices.status} NOT IN ('draft', 'cancelled')`,
        ),
      )
      .groupBy(salesInvoiceItems.itemId, items.name, items.type, items.costPrice, items.unit);

    // Coerce decimal-strings → numbers and compute profit/margin per item.
    // costPrice can be null for items where the user hasn't set it; we leave
    // those out of the margin ranking but keep them in the revenue ranking.
    const enriched = rows.map((r) => {
      const revenue = toNumber(r.revenue);
      const qty = toNumber(r.quantity);
      const costPerUnit = r.itemCostPrice ? toNumber(r.itemCostPrice) : null;
      const totalCost = costPerUnit != null ? costPerUnit * qty : null;
      const profit = totalCost != null ? revenue - totalCost : null;
      const marginPct = profit != null && revenue > 0 ? (profit / revenue) * 100 : null;
      return {
        itemId: r.itemId!,
        name: r.itemName,
        type: r.itemType as 'product' | 'service',
        unit: r.unit,
        revenue,
        quantity: qty,
        profit,
        marginPct,
      };
    });

    // Revenue mix by item type — sum across the entire enriched set so the
    // ratio matches the top-by-revenue list.
    const revenueMix = { product: 0, service: 0 };
    for (const row of enriched) {
      if (row.type === 'service') revenueMix.service += row.revenue;
      else revenueMix.product += row.revenue;
    }

    const topByRevenue = [...enriched]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    const topByMargin = enriched
      .filter((r) => r.marginPct != null)
      .sort((a, b) => (b.marginPct ?? 0) - (a.marginPct ?? 0))
      .slice(0, 10);

    return {
      periodDays: safeDays,
      from: fromIso,
      to: toIso,
      revenueMix,
      topByRevenue,
      topByMargin,
    };
  }

  async remove(id: string): Promise<void> {
    // Confirm the item belongs to this tenant before doing anything else.
    await this.getById(id);

    // Pre-check the only strict FK reference (price_list_items.item_id) so we
    // can return a useful 409 instead of a generic FK violation. Other tables
    // (quotes, sales_orders) store item_id without an FK constraint and don't
    // block delete — they'd just leave a dangling reference, which is the same
    // as today when an item is deactivated.
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(priceListItems)
      .where(eq(priceListItems.itemId, id));

    if ((count ?? 0) > 0) {
      throw new ConflictError(
        `Cannot delete — this item is on ${count} price list${count === 1 ? '' : 's'}. Remove it from the price list(s) first, or deactivate the item instead.`,
      );
    }

    const result = await this.db
      .delete(items)
      .where(and(eq(items.id, id), eq(items.tenantId, this.tenantId)))
      .returning({ id: items.id });

    if (result.length === 0) throw new NotFoundError('Item');
  }

  private toItem(row: typeof items.$inferSelect): Item {
    return {
      id: row.id,
      tenantId: row.tenantId,
      name: row.name,
      sku: row.sku,
      type: row.type,
      hsnSacCode: row.hsnSacCode,
      unit: row.unit,
      packSizeValue: row.packSizeValue ? toNumber(row.packSizeValue) : null,
      packSizeUqc: row.packSizeUqc,
      defaultSellingPrice: row.defaultSellingPrice ? toNumber(row.defaultSellingPrice) : null,
      defaultPurchasePrice: row.defaultPurchasePrice ? toNumber(row.defaultPurchasePrice) : null,
      gstRate: row.gstRate ? toNumber(row.gstRate) : null,
      mrp: row.mrp ? toNumber(row.mrp) : null,
      costPrice: row.costPrice ? toNumber(row.costPrice) : null,
      category: row.category,
      subcategory: row.subcategory,
      description: row.description,
      ean: row.ean,
      margin: row.margin ? toNumber(row.margin) : null,
      basicPrice: row.basicPrice ? toNumber(row.basicPrice) : null,
      gstValue: row.gstValue ? toNumber(row.gstValue) : null,
      attributes: row.attributes ?? null,
      cogmBreakdown: row.cogmBreakdown ?? null,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
