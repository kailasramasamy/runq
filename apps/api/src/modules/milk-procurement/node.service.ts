import { and, eq, desc, sql, or, ilike } from 'drizzle-orm';
import { mpNodes } from '@runq/db';
import type { Db, MpNodeRow } from '@runq/db';
import { applyPagination, calcTotalPages } from '@runq/db';
import type { PaginationMeta } from '@runq/types';
import type { CreateNodeInput, UpdateNodeInput, NodeFilter } from '@runq/validators';
import { ConflictError, NotFoundError } from '../../utils/errors';
import { MpPrincipal, scopeNodes } from './access-scope';

export interface NodeListResult {
  data: MpNodeRow[];
  meta: PaginationMeta;
}

/** Collection-network nodes (VMCC / CC / PP). */
export class NodeService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async list(
    filters: NodeFilter,
    pagination: { page: number; limit: number },
    principal: MpPrincipal,
  ): Promise<NodeListResult> {
    const { page, limit } = pagination;
    const { offset } = applyPagination(page, limit);
    const where = this.buildWhere(filters, principal);
    const [rows, countResult] = await Promise.all([
      this.db.select().from(mpNodes).where(where)
        .orderBy(desc(mpNodes.createdAt)).limit(limit).offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(mpNodes).where(where),
    ]);
    const total = countResult[0]?.count ?? 0;
    return { data: rows, meta: { page, limit, total, totalPages: calcTotalPages(total, limit) } };
  }

  async getById(id: string): Promise<MpNodeRow> {
    const [row] = await this.db.select().from(mpNodes)
      .where(and(eq(mpNodes.tenantId, this.tenantId), eq(mpNodes.id, id)));
    if (!row || row.deletedAt) throw new NotFoundError('Node not found');
    return row;
  }

  async create(input: CreateNodeInput): Promise<MpNodeRow> {
    await this.assertCodeFree(input.code);
    const [row] = await this.db.insert(mpNodes).values({
      tenantId: this.tenantId,
      code: input.code,
      name: input.name,
      nodeType: input.nodeType,
      parentNodeId: input.parentNodeId ?? null,
      hasBmc: input.hasBmc,
      capacityLitres: num(input.capacityLitres),
      payoutMode: input.payoutMode ?? null,
      payeeVendorId: input.payeeVendorId ?? null,
      addressLine1: input.addressLine1 ?? null,
      addressLine2: input.addressLine2 ?? null,
      city: input.city ?? null,
      state: input.state ?? null,
      pincode: input.pincode ?? null,
      lat: num(input.lat),
      lng: num(input.lng),
    }).returning();
    return row!;
  }

  async update(id: string, input: UpdateNodeInput): Promise<MpNodeRow> {
    await this.getById(id);
    const patch: Partial<typeof mpNodes.$inferInsert> = { updatedAt: new Date() };
    // raw values: assignDefined skips `undefined` (not provided) and applies
    // `null` (explicit clear) — so nullable fields clear correctly.
    assignDefined(patch, {
      name: input.name, nodeType: input.nodeType, hasBmc: input.hasBmc,
      payoutMode: input.payoutMode, payeeVendorId: input.payeeVendorId,
      parentNodeId: input.parentNodeId, addressLine1: input.addressLine1,
      addressLine2: input.addressLine2, city: input.city,
      state: input.state, pincode: input.pincode,
    });
    if (input.capacityLitres !== undefined) patch.capacityLitres = num(input.capacityLitres);
    if (input.lat !== undefined) patch.lat = num(input.lat);
    if (input.lng !== undefined) patch.lng = num(input.lng);
    const [row] = await this.db.update(mpNodes).set(patch)
      .where(and(eq(mpNodes.tenantId, this.tenantId), eq(mpNodes.id, id))).returning();
    return row!;
  }

  async deactivate(id: string): Promise<MpNodeRow> {
    await this.getById(id);
    const [row] = await this.db.update(mpNodes)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(mpNodes.tenantId, this.tenantId), eq(mpNodes.id, id))).returning();
    return row!;
  }

  private buildWhere(filters: NodeFilter, principal: MpPrincipal) {
    const conds = [eq(mpNodes.tenantId, this.tenantId), sql`${mpNodes.deletedAt} IS NULL`];
    if (filters.nodeType) conds.push(eq(mpNodes.nodeType, filters.nodeType));
    if (filters.parentNodeId) conds.push(eq(mpNodes.parentNodeId, filters.parentNodeId));
    if (filters.isActive !== undefined) conds.push(eq(mpNodes.isActive, filters.isActive));
    if (filters.search) {
      conds.push(or(ilike(mpNodes.name, `%${filters.search}%`), ilike(mpNodes.code, `%${filters.search}%`))!);
    }
    const scope = scopeNodes(principal);
    if (scope) conds.push(scope);
    return and(...conds);
  }

  private async assertCodeFree(code: string): Promise<void> {
    const [existing] = await this.db.select({ id: mpNodes.id }).from(mpNodes)
      .where(and(eq(mpNodes.tenantId, this.tenantId), eq(mpNodes.code, code)));
    if (existing) throw new ConflictError(`Node code "${code}" already exists`);
  }
}

/** numeric column ← number|null|undefined → string|null */
function num(v: number | null | undefined): string | null {
  return v != null ? String(v) : null;
}

/** copy only defined keys onto the patch */
function assignDefined(patch: Record<string, unknown>, fields: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) patch[k] = v;
  }
}
