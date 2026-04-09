import { eq, and, ilike, or, sql } from 'drizzle-orm';
import { items, priceListItems, tenants } from '@runq/db';
import type { Db } from '@runq/db';
import type { Item, ItemAttributeSchema, TenantSettings } from '@runq/types';
import type { CreateItemInput, UpdateItemInput, ItemFilterInput } from '@runq/validators';
import { getItemAttributeSchemaForIndustry } from '@runq/validators';
import { applyPagination, calcTotalPages } from '@runq/db';
import type { PaginationMeta } from '@runq/types';
import { ConflictError, NotFoundError } from '../../utils/errors';
import { toNumber } from '../../utils/decimal';

export interface ItemListParams {
  page: number;
  limit: number;
  filters: ItemFilterInput;
}

export interface ItemListResult {
  data: Item[];
  meta: PaginationMeta;
}

export class ItemService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async list(params: ItemListParams): Promise<ItemListResult> {
    const { page, limit, filters } = params;
    const { offset } = applyPagination(page, limit);

    const baseWhere = and(
      eq(items.tenantId, this.tenantId),
      filters.search
        ? or(
            ilike(items.name, `%${filters.search}%`),
            ilike(items.sku, `%${filters.search}%`),
          )
        : undefined,
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
      brand: row.brand,
      grammage: row.grammage,
      packingType: row.packingType,
      basicPrice: row.basicPrice ? toNumber(row.basicPrice) : null,
      gstValue: row.gstValue ? toNumber(row.gstValue) : null,
      shelfLifeDays: row.shelfLifeDays,
      rtvAllowed: row.rtvAllowed,
      vendorPackSize: row.vendorPackSize,
      packagingDimension: row.packagingDimension,
      temperature: row.temperature,
      cutoffTime: row.cutoffTime,
      productType: row.productType,
      // Prefer the JSONB payload when present. For legacy rows that were
      // written before Phase 1, synthesize an attributes object from the
      // dedicated FMCG columns so the form renders them correctly.
      attributes: row.attributes ?? synthesizeLegacyAttributes(row),
      cogmBreakdown: row.cogmBreakdown ?? null,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

/**
 * For items created before the attributes column existed, return an
 * `attributes` object populated from the legacy FMCG columns. Used by
 * `toItem` as a read-time fallback so the dynamic form sees the same
 * shape for every row, old and new.
 *
 * Returns null (not an empty object) when every legacy field is blank,
 * so clients can distinguish "no attributes set" from "all attributes
 * are empty strings".
 */
function synthesizeLegacyAttributes(row: typeof items.$inferSelect): Record<string, unknown> | null {
  const attrs: Record<string, unknown> = {};
  if (row.brand != null) attrs.brand = row.brand;
  if (row.productType != null) attrs.productType = row.productType;
  if (row.grammage != null) attrs.grammage = row.grammage;
  if (row.packingType != null) attrs.packingType = row.packingType;
  if (row.vendorPackSize != null) attrs.vendorPackSize = row.vendorPackSize;
  if (row.packagingDimension != null) attrs.packagingDimension = row.packagingDimension;
  if (row.shelfLifeDays != null) attrs.shelfLifeDays = row.shelfLifeDays;
  if (row.temperature != null) attrs.temperature = row.temperature;
  if (row.cutoffTime != null) attrs.cutoffTime = row.cutoffTime;
  if (row.rtvAllowed != null) attrs.rtvAllowed = row.rtvAllowed;
  return Object.keys(attrs).length > 0 ? attrs : null;
}
