import { eq, and, ilike, sql } from 'drizzle-orm';
import { items } from '@runq/db';
import type { Db } from '@runq/db';
import type { Item } from '@runq/types';
import type { CreateItemInput, UpdateItemInput, ItemFilterInput } from '@runq/validators';
import { applyPagination, calcTotalPages } from '@runq/db';
import type { PaginationMeta } from '@runq/types';
import { NotFoundError } from '../../utils/errors';
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
      filters.search ? ilike(items.name, `%${filters.search}%`) : undefined,
      filters.type ? eq(items.type, filters.type) : undefined,
      filters.category ? eq(items.category, filters.category) : undefined,
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
      defaultSellingPrice: input.defaultSellingPrice?.toString() ?? null,
      defaultPurchasePrice: input.defaultPurchasePrice?.toString() ?? null,
      gstRate: input.gstRate?.toString() ?? null,
    };

    const [row] = await this.db.insert(items).values(values).returning();
    return this.toItem(row!);
  }

  async update(id: string, input: UpdateItemInput): Promise<Item> {
    const set: Record<string, unknown> = { ...input, updatedAt: new Date() };
    if (input.defaultSellingPrice !== undefined) {
      set.defaultSellingPrice = input.defaultSellingPrice?.toString() ?? null;
    }
    if (input.defaultPurchasePrice !== undefined) {
      set.defaultPurchasePrice = input.defaultPurchasePrice?.toString() ?? null;
    }
    if (input.gstRate !== undefined) {
      set.gstRate = input.gstRate?.toString() ?? null;
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
      category: row.category,
      description: row.description,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
