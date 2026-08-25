import { and, eq, desc, sql, ilike, or, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { boms, bomLines, workOrders, woConsumption } from '@runq/db';
import type { Db } from '@runq/db';
import { applyPagination, calcTotalPages } from '@runq/db';
import { items, categories } from '@runq/db';
import type { BomListRow, BomWithLines, BomLine } from '@runq/types';
import type { PaginationMeta } from '@runq/types';
import type { CreateBomInput, UpdateBomInput, BomFilter } from '@runq/validators';
import { ConflictError, NotFoundError } from '../../utils/errors';

/** The handle drizzle hands a `db.transaction()` callback. */
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface BomListResult {
  data: BomListRow[];
  meta: PaginationMeta;
}

// The output item's place in the category tree. Same two-alias join the items
// master uses, so "category" means the same thing on both screens.
const catLeaf = alias(categories, 'bom_cat_leaf');
const catParent = alias(categories, 'bom_cat_parent');

/**
 * Category-tree order: root name, then leaf name, uncategorised last.
 *
 * The list is paginated, so grouping only holds if the server orders by
 * category — otherwise a category straddles a page boundary and the app
 * renders the same section header twice as you scroll.
 */
const BOM_CATEGORY_ASC = [
  sql`COALESCE(${catParent.name}, ${catLeaf.name}) ASC NULLS LAST`,
  sql`CASE WHEN ${catLeaf.parentId} IS NULL THEN NULL ELSE ${catLeaf.name} END ASC NULLS FIRST`,
  sql`${items.name} ASC`,
];

export class BomService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async list(
    filters: BomFilter,
    pagination: { page: number; limit: number },
  ): Promise<BomListResult> {
    const { page, limit } = pagination;
    const { offset } = applyPagination(page, limit);
    const where = this.buildWhere(filters);

    const [rows, countResult] = await Promise.all([
      this.db
        .select({
          bom: boms,
          outputItemName: items.name,
          outputCategoryId: items.categoryId,
          catLeafName: catLeaf.name,
          catLeafParentId: catLeaf.parentId,
          catParentName: catParent.name,
          lineCount: sql<number>`(SELECT count(*)::int FROM ${bomLines} WHERE ${bomLines.bomId} = ${boms.id})`,
        })
        .from(boms)
        .innerJoin(items, eq(items.id, boms.outputItemId))
        .leftJoin(catLeaf, eq(catLeaf.id, items.categoryId))
        .leftJoin(catParent, eq(catParent.id, catLeaf.parentId))
        .where(where)
        .orderBy(...(filters.sort === 'category' ? BOM_CATEGORY_ASC : [desc(boms.createdAt)]))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(boms)
        .where(where),
    ]);

    const total = countResult[0]?.count ?? 0;
    return {
      data: rows.map((r) => ({
        ...this.toBom(r.bom),
        outputItemName: r.outputItemName,
        outputCategoryId: r.outputCategoryId ?? null,
        // Mirrors ItemService.toItem(): a root-level leaf IS the category and
        // has no subcategory; a child leaf is the subcategory of its parent.
        outputCategory: r.catLeafParentId === null ? r.catLeafName : r.catParentName,
        outputSubcategory: r.catLeafParentId === null ? null : r.catLeafName,
        lineCount: r.lineCount,
      })),
      meta: { page, limit, total, totalPages: calcTotalPages(total, limit) },
    };
  }

  async getById(id: string): Promise<BomWithLines> {
    const [row] = await this.db
      .select({ bom: boms, outputItemName: items.name })
      .from(boms)
      .innerJoin(items, eq(items.id, boms.outputItemId))
      .where(and(eq(boms.id, id), eq(boms.tenantId, this.tenantId)))
      .limit(1);
    if (!row) throw new NotFoundError('Bom');

    const lines = await this.db
      .select({ line: bomLines, inputItemName: items.name })
      .from(bomLines)
      .innerJoin(items, eq(items.id, bomLines.inputItemId))
      .where(eq(bomLines.bomId, id))
      .orderBy(bomLines.lineNo);

    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(workOrders)
      .where(and(eq(workOrders.tenantId, this.tenantId), eq(workOrders.bomId, id)));

    return {
      ...this.toBom(row.bom),
      outputItemName: row.outputItemName,
      lines: lines.map((l) => this.toLine(l.line, l.inputItemName)),
      linkedWoCount: count ?? 0,
    };
  }

  async create(input: CreateBomInput, userId?: string): Promise<BomWithLines> {
    const result = await this.db.transaction(async (tx) => {
      // Enforce one-active-per-output: deactivate any existing active BOM
      await tx
        .update(boms)
        .set({ isActive: false, updatedAt: new Date() })
        .where(
          and(
            eq(boms.tenantId, this.tenantId),
            eq(boms.outputItemId, input.outputItemId),
            eq(boms.isActive, true),
          ),
        );

      const [bom] = await tx
        .insert(boms)
        .values({
          tenantId: this.tenantId,
          bomCode: input.bomCode,
          name: input.name,
          outputItemId: input.outputItemId,
          outputQty: String(input.outputQty),
          outputUom: input.outputUom,
          version: 1,
          isActive: true,
          allowAutoRepack: input.allowAutoRepack,
          effectiveFrom: input.effectiveFrom ?? null,
          notes: input.notes ?? null,
          createdBy: userId ?? null,
        })
        .returning();

      await tx.insert(bomLines).values(
        input.lines.map((l, i) => ({
          tenantId: this.tenantId,
          bomId: bom!.id,
          lineNo: i + 1,
          inputItemId: l.inputItemId,
          qtyPerOutput: String(l.qtyPerOutput),
          inputUom: l.inputUom,
          scrapPct: String(l.scrapPct),
          isOptional: l.isOptional,
          notes: l.notes ?? null,
        })),
      );

      return bom!;
    });

    return this.getById(result.id);
  }

  /**
   * Edit a BOM in place — never spawn a version row.
   *
   * The BOM only ever supplies *expected* figures: a WO screen joins the live
   * bom_lines to show planned qty. What actually moved is already frozen in
   * wo_consumption / wo_output (qty, batch, unit cost) and in the posted JE,
   * so editing the recipe cannot restate any history or GL. Versioning every
   * edit just buried the list under deactivated rows.
   */
  async update(id: string, input: UpdateBomInput): Promise<BomWithLines> {
    await this.getById(id); // tenant guard + 404
    return this.updateInPlace(id, input);
  }

  async clone(id: string, newBomCode: string, userId?: string): Promise<BomWithLines> {
    const source = await this.getById(id);

    const result = await this.db.transaction(async (tx) => {
      const [newBom] = await tx
        .insert(boms)
        .values({
          tenantId: this.tenantId,
          bomCode: newBomCode,
          name: source.name,
          outputItemId: source.outputItemId,
          outputQty: String(source.outputQty),
          outputUom: source.outputUom,
          version: 1,
          isActive: false,
          allowAutoRepack: source.allowAutoRepack,
          effectiveFrom: source.effectiveFrom ?? null,
          notes: source.notes ?? null,
          createdBy: userId ?? null,
        })
        .returning();

      await tx.insert(bomLines).values(
        source.lines.map((l) => ({
          tenantId: this.tenantId,
          bomId: newBom!.id,
          lineNo: l.lineNo,
          inputItemId: l.inputItemId,
          qtyPerOutput: String(l.qtyPerOutput),
          inputUom: l.inputUom,
          scrapPct: String(l.scrapPct),
          isOptional: l.isOptional,
          notes: l.notes ?? null,
        })),
      );

      return newBom!;
    });

    return this.getById(result.id);
  }

  async activate(id: string): Promise<BomWithLines> {
    const bom = await this.getById(id);

    await this.db.transaction(async (tx) => {
      // Deactivate any other active BOM for the same output item
      await tx
        .update(boms)
        .set({ isActive: false, updatedAt: new Date() })
        .where(
          and(
            eq(boms.tenantId, this.tenantId),
            eq(boms.outputItemId, bom.outputItemId),
            eq(boms.isActive, true),
          ),
        );

      await tx
        .update(boms)
        .set({ isActive: true, updatedAt: new Date() })
        .where(and(eq(boms.id, id), eq(boms.tenantId, this.tenantId)));
    });

    return this.getById(id);
  }

  async deactivate(id: string): Promise<BomWithLines> {
    await this.db
      .update(boms)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(boms.id, id), eq(boms.tenantId, this.tenantId)));

    return this.getById(id);
  }

  /**
   * Hard-delete a BOM. Refuses if any work order references it — the
   * referencing rows would either lose their audit link or need their
   * non-nullable bom_id wiped. Suggests deactivate for that case.
   */
  async delete(id: string): Promise<void> {
    // Confirm the BOM exists in this tenant (also catches cross-tenant id leaks).
    await this.getById(id);

    const [refCount] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(workOrders)
      .where(and(eq(workOrders.tenantId, this.tenantId), eq(workOrders.bomId, id)));
    if ((refCount?.n ?? 0) > 0) {
      throw new ConflictError(
        `BOM is referenced by ${refCount!.n} work order(s). Deactivate it instead — that hides it from new work orders while keeping the audit trail.`,
      );
    }

    await this.db.transaction(async (tx) => {
      await tx.delete(bomLines).where(eq(bomLines.bomId, id));
      await tx.delete(boms)
        .where(and(eq(boms.id, id), eq(boms.tenantId, this.tenantId)));
    });
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  private async updateInPlace(id: string, input: UpdateBomInput): Promise<BomWithLines> {
    await this.db.transaction(async (tx) => {
      const patch: Partial<typeof boms.$inferInsert> = { updatedAt: new Date() };
      if (input.name !== undefined) patch.name = input.name;
      if (input.outputQty !== undefined) patch.outputQty = String(input.outputQty);
      if (input.outputUom !== undefined) patch.outputUom = input.outputUom;
      if (input.allowAutoRepack !== undefined) patch.allowAutoRepack = input.allowAutoRepack;
      if (input.effectiveFrom !== undefined) patch.effectiveFrom = input.effectiveFrom ?? null;
      if (input.notes !== undefined) patch.notes = input.notes ?? null;

      await tx.update(boms).set(patch)
        .where(and(eq(boms.id, id), eq(boms.tenantId, this.tenantId)));

      if (input.lines) await this.syncLines(tx, id, input.lines);
    });

    return this.getById(id);
  }

  /**
   * Reconcile bom_lines against the submitted recipe, reusing existing rows
   * per input item instead of delete-and-reinsert. wo_consumption.bom_line_id
   * points at these rows, so a blind delete would either break the FK or
   * orphan the plan-vs-actual grouping on every past run.
   */
  private async syncLines(
    tx: Tx,
    bomId: string,
    lines: NonNullable<UpdateBomInput['lines']>,
  ): Promise<void> {
    const existing = await tx
      .select({ id: bomLines.id, inputItemId: bomLines.inputItemId })
      .from(bomLines)
      .where(eq(bomLines.bomId, bomId))
      .orderBy(bomLines.lineNo);

    const spare = new Map<string, string[]>();
    for (const row of existing) {
      const bucket = spare.get(row.inputItemId);
      if (bucket) bucket.push(row.id);
      else spare.set(row.inputItemId, [row.id]);
    }

    const kept = new Set<string>();
    for (const [i, l] of lines.entries()) {
      const values = {
        lineNo: i + 1,
        inputItemId: l.inputItemId,
        qtyPerOutput: String(l.qtyPerOutput),
        inputUom: l.inputUom,
        scrapPct: String(l.scrapPct ?? 0),
        isOptional: l.isOptional ?? false,
        notes: l.notes ?? null,
      };
      const reuseId = spare.get(l.inputItemId)?.shift();
      if (reuseId) {
        kept.add(reuseId);
        await tx.update(bomLines).set(values).where(eq(bomLines.id, reuseId));
      } else {
        await tx.insert(bomLines).values({ tenantId: this.tenantId, bomId, ...values });
      }
    }

    const dropped = existing.map((r) => r.id).filter((rowId) => !kept.has(rowId));
    if (dropped.length === 0) return;

    // A removed line may still be cited by a past run — detach it there so the
    // consumption row survives as ad-hoc rather than blocking the edit.
    await tx
      .update(woConsumption)
      .set({ bomLineId: null })
      .where(inArray(woConsumption.bomLineId, dropped));
    await tx.delete(bomLines).where(inArray(bomLines.id, dropped));
  }

  private buildWhere(filters: BomFilter) {
    return and(
      eq(boms.tenantId, this.tenantId),
      filters.outputItemId ? eq(boms.outputItemId, filters.outputItemId) : undefined,
      filters.isActive !== undefined ? eq(boms.isActive, filters.isActive) : undefined,
      filters.search
        ? or(
            ilike(boms.name, `%${filters.search}%`),
            ilike(boms.bomCode, `%${filters.search}%`),
          )
        : undefined,
    );
  }

  private toBom(row: typeof boms.$inferSelect) {
    return {
      id: row.id,
      tenantId: row.tenantId,
      bomCode: row.bomCode,
      name: row.name,
      outputItemId: row.outputItemId,
      outputQty: Number(row.outputQty),
      outputUom: row.outputUom,
      version: row.version,
      isActive: row.isActive,
      allowAutoRepack: row.allowAutoRepack,
      effectiveFrom: row.effectiveFrom ?? null,
      notes: row.notes ?? null,
      createdBy: row.createdBy ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toLine(
    row: typeof bomLines.$inferSelect,
    inputItemName: string,
  ): BomLine {
    return {
      id: row.id,
      tenantId: row.tenantId,
      bomId: row.bomId,
      lineNo: row.lineNo,
      inputItemId: row.inputItemId,
      inputItemName,
      qtyPerOutput: Number(row.qtyPerOutput),
      inputUom: row.inputUom,
      scrapPct: Number(row.scrapPct),
      isOptional: row.isOptional,
      notes: row.notes ?? null,
    };
  }
}
