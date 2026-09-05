import { eq, and, ilike, isNull, isNotNull, inArray, sql } from 'drizzle-orm';
import { categories, items } from '@runq/db';
import type { Db } from '@runq/db';
import type { Category } from '@runq/types';
import type {
  CreateCategoryInput, UpdateCategoryInput, CategoryFilterInput, CategoryTreeQuery,
} from '@runq/validators';
import { ITEM_CLASS_GROUP_MEMBERS } from '@runq/validators';
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

  async listTree(query: CategoryTreeQuery = {}): Promise<Category[]> {
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

    if (query.withCounts) {
      const direct = await this.itemCounts(query);
      for (const root of roots) this.applyCounts(root, direct);
    }

    return roots;
  }

  /**
   * Direct item count per category id, under the same class filter the
   * caller will drill in with. Counts active and inactive alike, because
   * `items.list` returns both — a count has to describe the list it opens.
   */
  private async itemCounts(query: CategoryTreeQuery): Promise<Map<string, number>> {
    const groupClasses = query.itemClassGroup && query.itemClassGroup !== 'all'
      ? [...ITEM_CLASS_GROUP_MEMBERS[query.itemClassGroup]]
      : null;

    const rows = await this.db
      .select({ categoryId: items.categoryId, n: sql<number>`count(*)::int` })
      .from(items)
      .where(and(
        eq(items.tenantId, this.tenantId),
        isNotNull(items.categoryId),
        query.itemClass ? eq(items.itemClass, query.itemClass as never) : undefined,
        groupClasses?.length ? inArray(items.itemClass, groupClasses as never[]) : undefined,
        query.unclassified ? isNull(items.itemClass) : undefined,
      ))
      .groupBy(items.categoryId);

    return new Map(rows.map((r) => [r.categoryId as string, r.n]));
  }

  /** Depth-first, so each node's total includes everything beneath it. */
  private applyCounts(node: Category, direct: Map<string, number>): number {
    const own = direct.get(node.id) ?? 0;
    const below = (node.subcategories ?? [])
      .reduce((sum, child) => sum + this.applyCounts(child, direct), 0);
    node.itemCount = own + below;
    return node.itemCount;
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
        isPrimaryInput: input.isPrimaryInput ?? false,
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
    if (input.isPrimaryInput !== undefined) set.isPrimaryInput = input.isPrimaryInput;

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
      isPrimaryInput: row.isPrimaryInput,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
