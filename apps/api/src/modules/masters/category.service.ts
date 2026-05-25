import { eq, and, ilike, isNull, sql } from 'drizzle-orm';
import { categories } from '@runq/db';
import type { Db } from '@runq/db';
import type { Category } from '@runq/types';
import type { CreateCategoryInput, UpdateCategoryInput, CategoryFilterInput } from '@runq/validators';
import { NotFoundError } from '../../utils/errors';
import { toNumber } from '../../utils/decimal';

export class CategoryService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async list(filters: CategoryFilterInput): Promise<Category[]> {
    const parentAlias = categories;

    const baseWhere = and(
      eq(categories.tenantId, this.tenantId),
      filters.search ? ilike(categories.name, `%${filters.search}%`) : undefined,
      filters.parentId ? eq(categories.parentId, filters.parentId) : undefined,
      filters.rootOnly ? isNull(categories.parentId) : undefined,
    );

    const rows = await this.db
      .select()
      .from(categories)
      .where(baseWhere)
      .orderBy(categories.sortOrder, categories.name);

    return rows.map((r) => this.toCategory(r));
  }

  async listTree(): Promise<Category[]> {
    const all = await this.db
      .select()
      .from(categories)
      .where(eq(categories.tenantId, this.tenantId))
      .orderBy(categories.sortOrder, categories.name);

    const map = new Map<string, Category>();
    const roots: Category[] = [];

    for (const r of all) {
      map.set(r.id, { ...this.toCategory(r), subcategories: [] });
    }

    for (const cat of map.values()) {
      if (cat.parentId) {
        const parent = map.get(cat.parentId);
        if (parent) parent.subcategories!.push(cat);
      } else {
        roots.push(cat);
      }
    }

    return roots;
  }

  async getById(id: string): Promise<Category> {
    const [row] = await this.db
      .select()
      .from(categories)
      .where(and(eq(categories.id, id), eq(categories.tenantId, this.tenantId)))
      .limit(1);

    if (!row) throw new NotFoundError('Category');
    return this.toCategory(row);
  }

  async create(input: CreateCategoryInput): Promise<Category> {
    const [row] = await this.db
      .insert(categories)
      .values({
        tenantId: this.tenantId,
        name: input.name,
        parentId: input.parentId ?? null,
        defaultHsnSac: input.defaultHsnSac ?? null,
        defaultGstRate: input.defaultGstRate?.toString() ?? null,
        sortOrder: input.sortOrder ?? 0,
      })
      .returning();

    return this.toCategory(row!);
  }

  async update(id: string, input: UpdateCategoryInput): Promise<Category> {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) set.name = input.name;
    if (input.parentId !== undefined) set.parentId = input.parentId ?? null;
    if (input.defaultHsnSac !== undefined) set.defaultHsnSac = input.defaultHsnSac ?? null;
    if (input.defaultGstRate !== undefined) {
      set.defaultGstRate = input.defaultGstRate?.toString() ?? null;
    }
    if (input.sortOrder !== undefined) set.sortOrder = input.sortOrder;

    const [row] = await this.db
      .update(categories)
      .set(set)
      .where(and(eq(categories.id, id), eq(categories.tenantId, this.tenantId)))
      .returning();

    if (!row) throw new NotFoundError('Category');
    return this.toCategory(row);
  }

  async toggleActive(id: string): Promise<Category> {
    const existing = await this.getById(id);
    const [row] = await this.db
      .update(categories)
      .set({ isActive: !existing.isActive, updatedAt: new Date() })
      .where(and(eq(categories.id, id), eq(categories.tenantId, this.tenantId)))
      .returning();

    if (!row) throw new NotFoundError('Category');
    return this.toCategory(row);
  }

  async remove(id: string): Promise<void> {
    const result = await this.db
      .delete(categories)
      .where(and(eq(categories.id, id), eq(categories.tenantId, this.tenantId)))
      .returning();

    if (result.length === 0) throw new NotFoundError('Category');
  }

  private toCategory(row: typeof categories.$inferSelect): Category {
    return {
      id: row.id,
      tenantId: row.tenantId,
      name: row.name,
      parentId: row.parentId,
      defaultHsnSac: row.defaultHsnSac,
      defaultGstRate: row.defaultGstRate ? toNumber(row.defaultGstRate) : null,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
