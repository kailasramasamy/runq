import { eq, and, ilike, or, sql, gte, lte, isNull, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { items, categories, priceListItems, salesInvoices, salesInvoiceItems, tenants } from '@runq/db';
import { ITEM_CLASS_GROUP_MEMBERS } from '@runq/validators';

// Joined view of an item row + category leaf + parent. We compose this
// once per read query so toItem() can derive the `category` / `subcategory`
// display strings without each query repeating the join shape.
const catLeaf = alias(categories, 'cat_leaf');
const catParent = alias(categories, 'cat_parent');

type ItemRowWithCategory = {
  item: typeof items.$inferSelect;
  catLeafName: string | null;
  catLeafParentId: string | null;
  catParentName: string | null;
};
import type { Db } from '@runq/db';
import type { Item, ItemAttributeSchema, TenantSettings } from '@runq/types';
import type { CreateItemInput, UpdateItemInput, ItemFilterInput, ItemClass } from '@runq/validators';
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

/**
 * Per-item-class tracking defaults. Applied at create time only when the
 * caller doesn't already supply an explicit value, so existing flows that
 * never touch tracking flags get sensible behavior (perishable raw
 * materials default to batch + expiry; spares & consumables don't).
 *
 * These are advisory — the column-level booleans remain authoritative,
 * so a tenant can override any default via the item edit screen later.
 */
const CLASS_TRACKING_DEFAULTS: Record<ItemClass, { trackBatches: boolean; trackExpiry: boolean }> = {
  raw_material:  { trackBatches: true,  trackExpiry: true  },
  packaging:     { trackBatches: false, trackExpiry: false },
  finished_good: { trackBatches: true,  trackExpiry: true  },
  semi_finished: { trackBatches: true,  trackExpiry: true  },
  trading_good:  { trackBatches: false, trackExpiry: false },
  consumable:    { trackBatches: false, trackExpiry: false },
  spare_part:    { trackBatches: false, trackExpiry: false },
};

/**
 * Resolve item_class + class-driven tracking defaults for create.
 *  • products without itemClass default to 'trading_good' so the existing
 *    item-create form keeps working until the UI ships the dropdown,
 *  • services must keep itemClass NULL (DB CHECK enforces this).
 */
function resolveItemClassForCreate(input: CreateItemInput): {
  itemClass: ItemClass | null;
  trackBatches?: boolean;
  trackExpiry?: boolean;
} {
  if (input.type === 'service') return { itemClass: null };
  const itemClass: ItemClass = input.itemClass ?? 'trading_good';
  return { itemClass, ...CLASS_TRACKING_DEFAULTS[itemClass] };
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

    // Legacy `category` / `subcategory` string filters are resolved to
    // a categoryId by looking up the matching category tree row — keeps
    // the public list endpoint backward-compatible after migration 0113
    // drops the denormalized strings off items.
    const legacyCategoryFilterId = await this.resolveLegacyCategoryFilter(
      filters.category,
      filters.subcategory,
    );

    // Expand the operational bucket to its underlying item_class set. The
    // tab strips on the web items list + inventory screens send the bucket
    // name; this single line keeps it server-side so pagination stays
    // accurate (filtering after page 1 of 30 items would miss buckets).
    const groupClasses = filters.itemClassGroup && filters.itemClassGroup !== 'all'
      ? [...ITEM_CLASS_GROUP_MEMBERS[filters.itemClassGroup]]
      : null;

    const baseWhere = and(
      eq(items.tenantId, this.tenantId),
      searchClause,
      filters.type ? eq(items.type, filters.type) : undefined,
      filters.itemClass ? eq(items.itemClass, filters.itemClass) : undefined,
      groupClasses && groupClasses.length > 0 ? inArray(items.itemClass, groupClasses) : undefined,
      filters.categoryId ? eq(items.categoryId, filters.categoryId) : undefined,
      legacyCategoryFilterId ? eq(items.categoryId, legacyCategoryFilterId) : undefined,
    );

    const [rows, countResult] = await Promise.all([
      this.selectItemsWithCategory().where(baseWhere).orderBy(items.name).limit(limit).offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(items).where(baseWhere),
    ]);

    const total = countResult[0]?.count ?? 0;
    return {
      data: rows.map((r) => this.toItem(r)),
      meta: { page, limit, total, totalPages: calcTotalPages(total, limit) },
    };
  }

  /// Strip trailing size tokens from a name so siblings can be matched on
  /// the "product" portion alone. Handles forms like:
  ///   "Mustard Oil 100ml"       → "Mustard Oil"
  ///   "A2 Cow Milk 500 ML"      → "A2 Cow Milk"
  ///   "Sugar 1 kg"              → "Sugar"
  ///   "Atta - 5kg"              → "Atta"
  /// Case-insensitive; only strips the *trailing* size, so "100ml jar" is
  /// untouched (we'd treat it as a different product family).
  static stripSizeSuffix(name: string): string {
    const unit = '(?:ml|l|g|kg|gm|mg|ltr|pcs|nos|pc|pack)';
    const re = new RegExp(`[\\s,\\-]*\\d+(?:\\.\\d+)?\\s*${unit}\\b\\s*$`, 'i');
    return name.replace(re, '').trim();
  }

  /// Sibling SKUs of `id` — same tenant, active, same stripped product name.
  /// Excludes the source item itself. Used by the mobile PO line editor to
  /// let the user swap to a different pack size (e.g. 100ml ↔ 1L).
  async findVariants(id: string): Promise<Item[]> {
    const source = await this.getById(id);
    const root = ItemService.stripSizeSuffix(source.name);
    if (!root) return [];
    // Match items whose stripped name equals the source root. We compare in
    // SQL by re-applying the same regex via a Postgres expression; cheaper
    // alternative is to fetch by name-ilike and filter in JS, which keeps
    // the regex logic in one place. Few items per tenant ⇒ JS filter is fine.
    const candidates = await this.selectItemsWithCategory()
      .where(
        and(
          eq(items.tenantId, this.tenantId),
          eq(items.isActive, true),
          ilike(items.name, `${root}%`),
        ),
      )
      .orderBy(items.name);
    return candidates
      .filter((c) => c.item.id !== id)
      .filter(
        (c) =>
          ItemService.stripSizeSuffix(c.item.name).toLowerCase() ===
          root.toLowerCase(),
      )
      .map((r) => this.toItem(r));
  }

  async getById(id: string): Promise<Item> {
    const [row] = await this.selectItemsWithCategory()
      .where(and(eq(items.id, id), eq(items.tenantId, this.tenantId)))
      .limit(1);

    if (!row) throw new NotFoundError('Item');
    return this.toItem(row);
  }

  async create(input: CreateItemInput): Promise<Item> {
    // Resolve category-driven defaults: prefer explicit categoryId, fall
    // back to string lookup so legacy callers keep working. When the
    // category carries HSN / GST defaults and the item leaves those blank,
    // inherit from the category — fixes the "every CA-imported row is
    // missing HSN" pain.
    const categoryId = await this.resolveCategoryIdForCreate(input);
    const catDefaults = await this.loadCategoryDefaults(categoryId);

    // Order matters: class defaults supply tracking when the caller omits
    // them, but explicit input.track* values must win. Spread class defaults
    // AFTER ...input, then re-apply nullish-coalesce so an explicit `false`
    // from the form (e.g. unchecking Expiry on a perishable raw_material)
    // overrides the default `true`.
    const classFields = resolveItemClassForCreate(input);
    const values = {
      ...input,
      tenantId: this.tenantId,
      categoryId,
      hsnSacCode: input.hsnSacCode ?? catDefaults.hsnSacCode ?? null,
      attributes: input.attributes ?? null,
      defaultSellingPrice: input.defaultSellingPrice?.toString() ?? null,
      defaultPurchasePrice: input.defaultPurchasePrice?.toString() ?? null,
      gstRate: (input.gstRate ?? catDefaults.gstRate)?.toString() ?? null,
      mrp: input.mrp?.toString() ?? null,
      costPrice: input.costPrice?.toString() ?? null,
      margin: input.margin?.toString() ?? null,
      basicPrice: input.basicPrice?.toString() ?? null,
      gstValue: input.gstValue?.toString() ?? null,
      ...resolvePackSizeForCreate(input),
      itemClass: classFields.itemClass,
      // Tracking precedence: explicit input → class default → DB default.
      trackInventory: input.trackInventory,
      trackBatches: input.trackBatches ?? classFields.trackBatches,
      trackExpiry:   input.trackExpiry   ?? classFields.trackExpiry,
      trackSerials:  input.trackSerials,
    };

    const [row] = await this.db.insert(items).values(values).returning({ id: items.id });
    return this.getById(row!.id);
  }

  /**
   * Bulk reclassify items to a single item_class. Used by the items list
   * page's multi-select toolbar so a tenant can fix the Phase-1 backfill
   * (everything → 'trading_good') in a few clicks instead of editing each
   * item individually. Tenant-scoped via the WHERE clause so a leaked id
   * from another tenant can't bleed across.
   */
  async bulkUpdateClass(itemIds: string[], itemClass: ItemClass): Promise<{ updated: number }> {
    if (itemIds.length === 0) return { updated: 0 };
    const result = await this.db
      .update(items)
      .set({ itemClass, updatedAt: new Date() })
      .where(
        and(
          eq(items.tenantId, this.tenantId),
          eq(items.type, 'product'), // services keep item_class NULL (CHECK)
          inArray(items.id, itemIds),
        ),
      )
      .returning({ id: items.id });
    return { updated: result.length };
  }

  /**
   * Bucket counts for the class-group tab strip. Returns the number of
   * active products per operational bucket — Finished / Inputs / Trading
   * / Other — so the UI can render counts + fall through to the first
   * non-empty bucket on page load. Counts only active items because the
   * tab strip drives the visible catalogue list, which also filters by
   * is_active.
   */
  async classGroupCounts(): Promise<Record<'finished' | 'inputs' | 'trading' | 'other', number>> {
    const rows = await this.db
      .select({
        itemClass: items.itemClass,
        count: sql<number>`count(*)::int`,
      })
      .from(items)
      .where(and(eq(items.tenantId, this.tenantId), eq(items.isActive, true)))
      .groupBy(items.itemClass);
    const out = { finished: 0, inputs: 0, trading: 0, other: 0 };
    for (const r of rows) {
      switch (r.itemClass) {
        case 'finished_good':
        case 'semi_finished':
          out.finished += r.count;
          break;
        case 'raw_material':
        case 'packaging':
          out.inputs += r.count;
          break;
        case 'trading_good':
          out.trading += r.count;
          break;
        case 'consumable':
        case 'spare_part':
          out.other += r.count;
          break;
        // item_class is NULL for services — those don't appear in any
        // bucket and aren't counted here.
      }
    }
    return out;
  }

  /** List-filter helper — turns legacy `category` / `subcategory` query
   *  params into a categoryId so the items list endpoint stays compatible
   *  after migration 0113 drops the denormalized strings. */
  private async resolveLegacyCategoryFilter(
    category?: string,
    subcategory?: string,
  ): Promise<string | null> {
    if (!category) return null;
    return this.resolveCategoryIdForCreate({
      category,
      subcategory,
    } as CreateItemInput);
  }

  /** Resolve which category id to store, preferring explicit input, then
   *  matching `category` / `subcategory` strings to a node in the tree. */
  private async resolveCategoryIdForCreate(input: CreateItemInput): Promise<string | null> {
    if (input.categoryId) return input.categoryId;
    if (!input.category) return null;
    // Leaf match first (parent.name = category, leaf.name = subcategory).
    if (input.subcategory) {
      const [leaf] = await this.db
        .select({ id: categories.id })
        .from(categories)
        .innerJoin(
          sql`${categories} AS parent`,
          sql`parent.id = ${categories.parentId} AND parent.name = ${input.category}`,
        )
        .where(
          and(
            eq(categories.tenantId, this.tenantId),
            eq(categories.name, input.subcategory),
          ),
        )
        .limit(1);
      if (leaf) return leaf.id;
    }
    const [root] = await this.db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.tenantId, this.tenantId),
          isNull(categories.parentId),
          eq(categories.name, input.category),
        ),
      )
      .limit(1);
    return root?.id ?? null;
  }

  /** Read default HSN / GST off the category (and its parent, if leaf). */
  private async loadCategoryDefaults(
    categoryId: string | null,
  ): Promise<{ hsnSacCode: string | null; gstRate: number | null }> {
    if (!categoryId) return { hsnSacCode: null, gstRate: null };
    const [leaf] = await this.db
      .select({
        defaultHsnSac: categories.defaultHsnSac,
        defaultGstRate: categories.defaultGstRate,
        parentId: categories.parentId,
      })
      .from(categories)
      .where(and(eq(categories.id, categoryId), eq(categories.tenantId, this.tenantId)))
      .limit(1);
    if (!leaf) return { hsnSacCode: null, gstRate: null };
    let hsn = leaf.defaultHsnSac;
    let gst = leaf.defaultGstRate;
    // Parent fallback — a leaf usually inherits its parent's HSN family.
    if ((!hsn || !gst) && leaf.parentId) {
      const [parent] = await this.db
        .select({
          defaultHsnSac: categories.defaultHsnSac,
          defaultGstRate: categories.defaultGstRate,
        })
        .from(categories)
        .where(eq(categories.id, leaf.parentId))
        .limit(1);
      hsn = hsn ?? parent?.defaultHsnSac ?? null;
      gst = gst ?? parent?.defaultGstRate ?? null;
    }
    return {
      hsnSacCode: hsn,
      gstRate: gst ? toNumber(gst) : null,
    };
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
      .returning({ id: items.id });

    if (!row) throw new NotFoundError('Item');
    return this.getById(row.id);
  }

  async toggleActive(id: string): Promise<Item> {
    const existing = await this.getById(id);
    const [row] = await this.db
      .update(items)
      .set({ isActive: !existing.isActive, updatedAt: new Date() })
      .where(and(eq(items.id, id), eq(items.tenantId, this.tenantId)))
      .returning({ id: items.id });

    if (!row) throw new NotFoundError('Item');
    return this.getById(row.id);
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

  /**
   * Standard select shape for any items query that wants `category` /
   * `subcategory` populated. Joins the leaf category + its parent so the
   * derived strings can be computed in JS (cheaper + clearer than two
   * scalar subqueries per row).
   */
  private selectItemsWithCategory() {
    return this.db
      .select({
        item: items,
        catLeafName: catLeaf.name,
        catLeafParentId: catLeaf.parentId,
        catParentName: catParent.name,
      })
      .from(items)
      .leftJoin(catLeaf, eq(catLeaf.id, items.categoryId))
      .leftJoin(catParent, eq(catParent.id, catLeaf.parentId));
  }

  private toItem(joined: ItemRowWithCategory): Item {
    const row = joined.item;
    // Leaf → derived strings: root nodes give category=name/sub=null, leaf
    // nodes give category=parent.name/sub=leaf.name. Categories table is
    // the only source of truth now that items.category / .subcategory are
    // gone (migration 0113).
    const category = joined.catLeafParentId === null
      ? joined.catLeafName
      : joined.catParentName;
    const subcategory = joined.catLeafParentId === null
      ? null
      : joined.catLeafName;
    return {
      id: row.id,
      tenantId: row.tenantId,
      name: row.name,
      sku: row.sku,
      type: row.type,
      itemClass: row.itemClass,
      categoryId: row.categoryId,
      hsnSacCode: row.hsnSacCode,
      unit: row.unit,
      packSizeValue: row.packSizeValue ? toNumber(row.packSizeValue) : null,
      packSizeUqc: row.packSizeUqc,
      defaultSellingPrice: row.defaultSellingPrice ? toNumber(row.defaultSellingPrice) : null,
      defaultPurchasePrice: row.defaultPurchasePrice ? toNumber(row.defaultPurchasePrice) : null,
      gstRate: row.gstRate ? toNumber(row.gstRate) : null,
      mrp: row.mrp ? toNumber(row.mrp) : null,
      costPrice: row.costPrice ? toNumber(row.costPrice) : null,
      category,
      subcategory,
      description: row.description,
      ean: row.ean,
      margin: row.margin ? toNumber(row.margin) : null,
      basicPrice: row.basicPrice ? toNumber(row.basicPrice) : null,
      gstValue: row.gstValue ? toNumber(row.gstValue) : null,
      attributes: row.attributes ?? null,
      cogmBreakdown: row.cogmBreakdown ?? null,
      trackInventory: row.trackInventory,
      trackBatches: row.trackBatches,
      trackExpiry: row.trackExpiry,
      trackSerials: row.trackSerials,
      batchCodeTemplate: row.batchCodeTemplate,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
