import { eq, and, ilike, sql } from 'drizzle-orm';
import { priceLists, priceListItems, items, customers, vendors } from '@runq/db';
import type { Db } from '@runq/db';
import type { PriceList, PriceListItem } from '@runq/types';
import type { CreatePriceListInput, UpdatePriceListInput, PriceListFilterInput } from '@runq/validators';
import { applyPagination, calcTotalPages } from '@runq/db';
import type { PaginationMeta } from '@runq/types';
import { NotFoundError } from '../../utils/errors';
import { toNumber } from '../../utils/decimal';

export interface PriceListListParams {
  page: number;
  limit: number;
  filters: PriceListFilterInput;
}

export interface PriceListListResult {
  data: (Omit<PriceList, 'items'> & { itemCount: number })[];
  meta: PaginationMeta;
}

export class PriceListService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async list(params: PriceListListParams): Promise<PriceListListResult> {
    const { page, limit, filters } = params;
    const { offset } = applyPagination(page, limit);

    const baseWhere = and(
      eq(priceLists.tenantId, this.tenantId),
      filters.search ? ilike(priceLists.name, `%${filters.search}%`) : undefined,
      filters.type ? eq(priceLists.type, filters.type) : undefined,
      filters.applyTo ? eq(priceLists.applyTo, filters.applyTo) : undefined,
    );

    const itemCountSq = this.db
      .select({ priceListId: priceListItems.priceListId, count: sql<number>`count(*)::int`.as('count') })
      .from(priceListItems)
      .groupBy(priceListItems.priceListId)
      .as('item_counts');

    const [rows, countResult] = await Promise.all([
      this.db
        .select({
          pl: priceLists,
          customerName: customers.name,
          vendorName: vendors.name,
          itemCount: sql<number>`coalesce(${itemCountSq.count}, 0)`.as('item_count'),
        })
        .from(priceLists)
        .leftJoin(customers, eq(priceLists.customerId, customers.id))
        .leftJoin(vendors, eq(priceLists.vendorId, vendors.id))
        .leftJoin(itemCountSq, eq(priceLists.id, itemCountSq.priceListId))
        .where(baseWhere)
        .orderBy(priceLists.name)
        .limit(limit)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(priceLists).where(baseWhere),
    ]);

    const total = countResult[0]?.count ?? 0;
    return {
      data: rows.map((r) => ({
        ...this.toPriceList(r.pl),
        customerName: r.customerName ?? null,
        vendorName: r.vendorName ?? null,
        itemCount: r.itemCount ?? 0,
        items: [],
      })),
      meta: { page, limit, total, totalPages: calcTotalPages(total, limit) },
    };
  }

  async getById(id: string): Promise<PriceList> {
    const [row] = await this.db
      .select({ pl: priceLists, customerName: customers.name, vendorName: vendors.name })
      .from(priceLists)
      .leftJoin(customers, eq(priceLists.customerId, customers.id))
      .leftJoin(vendors, eq(priceLists.vendorId, vendors.id))
      .where(and(eq(priceLists.id, id), eq(priceLists.tenantId, this.tenantId)))
      .limit(1);

    if (!row) throw new NotFoundError('Price List');

    const lineItems = await this.db
      .select({ pli: priceListItems, itemName: items.name, itemSku: items.sku })
      .from(priceListItems)
      .leftJoin(items, eq(priceListItems.itemId, items.id))
      .where(eq(priceListItems.priceListId, id))
      .orderBy(items.name);

    return {
      ...this.toPriceList(row.pl),
      customerName: row.customerName ?? null,
      vendorName: row.vendorName ?? null,
      items: lineItems.map((li) => this.toPriceListItem(li.pli, li.itemName ?? '', li.itemSku ?? null)),
    };
  }

  async create(input: CreatePriceListInput): Promise<PriceList> {
    return this.db.transaction(async (tx) => {
      const [header] = await tx
        .insert(priceLists)
        .values({
          tenantId: this.tenantId,
          name: input.name,
          type: input.type,
          currency: input.currency,
          applyTo: input.applyTo,
          applyToValue: input.applyToValue ?? null,
          customerId: input.customerId ?? null,
          vendorId: input.vendorId ?? null,
          validFrom: input.validFrom ?? null,
          validTo: input.validTo ?? null,
        })
        .returning();

      const lineValues = input.items.map((li) => ({
        priceListId: header!.id,
        itemId: li.itemId,
        rate: li.rate.toString(),
        marginPercent: li.marginPercent?.toString() ?? null,
        discountPercent: li.discountPercent?.toString() ?? null,
        minQuantity: li.minQuantity?.toString() ?? null,
      }));

      await tx.insert(priceListItems).values(lineValues);

      return this.getById(header!.id);
    });
  }

  async update(id: string, input: UpdatePriceListInput): Promise<PriceList> {
    return this.db.transaction(async (tx) => {
      const headerSet: Record<string, unknown> = { updatedAt: new Date() };
      if (input.name !== undefined) headerSet.name = input.name;
      if (input.type !== undefined) headerSet.type = input.type;
      if (input.currency !== undefined) headerSet.currency = input.currency;
      if (input.applyTo !== undefined) headerSet.applyTo = input.applyTo;
      if (input.applyToValue !== undefined) headerSet.applyToValue = input.applyToValue ?? null;
      if (input.customerId !== undefined) headerSet.customerId = input.customerId ?? null;
      if (input.vendorId !== undefined) headerSet.vendorId = input.vendorId ?? null;
      if (input.validFrom !== undefined) headerSet.validFrom = input.validFrom ?? null;
      if (input.validTo !== undefined) headerSet.validTo = input.validTo ?? null;

      const [row] = await tx
        .update(priceLists)
        .set(headerSet)
        .where(and(eq(priceLists.id, id), eq(priceLists.tenantId, this.tenantId)))
        .returning();

      if (!row) throw new NotFoundError('Price List');

      if (input.items) {
        await tx.delete(priceListItems).where(eq(priceListItems.priceListId, id));
        const lineValues = input.items.map((li) => ({
          priceListId: id,
          itemId: li.itemId,
          rate: li.rate.toString(),
          marginPercent: li.marginPercent?.toString() ?? null,
          discountPercent: li.discountPercent?.toString() ?? null,
          minQuantity: li.minQuantity?.toString() ?? null,
        }));
        await tx.insert(priceListItems).values(lineValues);
      }

      return this.getById(id);
    });
  }

  async toggleActive(id: string): Promise<PriceList> {
    const existing = await this.getById(id);
    const [row] = await this.db
      .update(priceLists)
      .set({ isActive: !existing.isActive, updatedAt: new Date() })
      .where(and(eq(priceLists.id, id), eq(priceLists.tenantId, this.tenantId)))
      .returning();

    if (!row) throw new NotFoundError('Price List');
    return this.getById(id);
  }

  private toPriceList(row: typeof priceLists.$inferSelect): Omit<PriceList, 'items'> {
    return {
      id: row.id,
      tenantId: row.tenantId,
      name: row.name,
      type: row.type,
      currency: row.currency,
      applyTo: row.applyTo,
      applyToValue: row.applyToValue,
      customerId: row.customerId,
      vendorId: row.vendorId,
      validFrom: row.validFrom,
      validTo: row.validTo,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toPriceListItem(
    row: typeof priceListItems.$inferSelect,
    itemName: string,
    itemSku: string | null,
  ): PriceListItem {
    return {
      id: row.id,
      priceListId: row.priceListId,
      itemId: row.itemId,
      itemName,
      itemSku,
      rate: toNumber(row.rate),
      marginPercent: row.marginPercent ? toNumber(row.marginPercent) : null,
      discountPercent: row.discountPercent ? toNumber(row.discountPercent) : null,
      minQuantity: row.minQuantity ? toNumber(row.minQuantity) : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
