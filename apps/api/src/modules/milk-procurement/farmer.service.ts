import { and, eq, desc, sql, or, ilike } from 'drizzle-orm';
import { mpFarmers, mpFarmerMemberships, vendors } from '@runq/db';
import type { Db, MpFarmerRow } from '@runq/db';
import { applyPagination, calcTotalPages } from '@runq/db';
import type { PaginationMeta } from '@runq/types';
import type { CreateFarmerInput, UpdateFarmerInput, FarmerFilter } from '@runq/validators';
import { ConflictError, NotFoundError } from '../../utils/errors';
import { MpPrincipal, scopeFarmers } from './access-scope';

export interface FarmerListResult {
  data: MpFarmerRow[];
  meta: PaginationMeta;
}

/** Farmer/society master. Financial identity = a `vendors` row. */
export class FarmerService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async list(
    filters: FarmerFilter,
    pagination: { page: number; limit: number },
    principal: MpPrincipal,
  ): Promise<FarmerListResult> {
    const { page, limit } = pagination;
    const { offset } = applyPagination(page, limit);
    const where = this.buildWhere(filters, principal);
    const [rows, countResult] = await Promise.all([
      this.db.select().from(mpFarmers).where(where)
        .orderBy(desc(mpFarmers.createdAt)).limit(limit).offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(mpFarmers).where(where),
    ]);
    const total = countResult[0]?.count ?? 0;
    return { data: rows, meta: { page, limit, total, totalPages: calcTotalPages(total, limit) } };
  }

  async getById(id: string): Promise<MpFarmerRow> {
    const [row] = await this.db.select().from(mpFarmers)
      .where(and(eq(mpFarmers.tenantId, this.tenantId), eq(mpFarmers.id, id)));
    if (!row || row.deletedAt) throw new NotFoundError('Farmer not found');
    return row;
  }

  async create(input: CreateFarmerInput): Promise<MpFarmerRow> {
    await this.assertCodeFree(input.code);
    return this.db.transaction(async (tx) => {
      // financial identity: link an existing vendor, or auto-create one
      let vendorId = input.vendorId ?? null;
      if (!vendorId) {
        const [v] = await tx.insert(vendors).values({
          tenantId: this.tenantId,
          name: input.name,
          phone: input.phone ?? null,
          bankAccountName: input.bankAccountName ?? null,
          bankAccountNumber: input.bankAccountNumber ?? null,
          bankIfsc: input.bankIfsc ?? null,
          bankName: input.bankName ?? null,
          category: 'farmer',
        }).returning({ id: vendors.id });
        vendorId = v!.id;
      }
      const [farmer] = await tx.insert(mpFarmers).values({
        tenantId: this.tenantId,
        vendorId,
        code: input.code,
        name: input.name,
        phone: input.phone ?? null,
        isSociety: input.isSociety,
        defaultMilkType: input.defaultMilkType,
        cattleCount: input.cattleCount ?? null,
        kycDocId: input.kycDocId ?? null,
      }).returning();
      if (input.nodeId) {
        await tx.insert(mpFarmerMemberships).values({
          tenantId: this.tenantId, farmerId: farmer!.id, nodeId: input.nodeId, isPrimary: true,
        });
      }
      return farmer!;
    });
  }

  async update(id: string, input: UpdateFarmerInput): Promise<MpFarmerRow> {
    await this.getById(id);
    const patch: Partial<typeof mpFarmers.$inferInsert> = { updatedAt: new Date() };
    for (const [k, v] of Object.entries({
      name: input.name, phone: input.phone, isSociety: input.isSociety,
      defaultMilkType: input.defaultMilkType, cattleCount: input.cattleCount,
      kycDocId: input.kycDocId,
    })) {
      if (v !== undefined) (patch as Record<string, unknown>)[k] = v;
    }
    const [row] = await this.db.update(mpFarmers).set(patch)
      .where(and(eq(mpFarmers.tenantId, this.tenantId), eq(mpFarmers.id, id))).returning();
    return row!;
  }

  async deactivate(id: string): Promise<MpFarmerRow> {
    await this.getById(id);
    const [row] = await this.db.update(mpFarmers)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(mpFarmers.tenantId, this.tenantId), eq(mpFarmers.id, id))).returning();
    return row!;
  }

  private buildWhere(filters: FarmerFilter, principal: MpPrincipal) {
    const conds = [eq(mpFarmers.tenantId, this.tenantId), sql`${mpFarmers.deletedAt} IS NULL`];
    if (filters.isActive !== undefined) conds.push(eq(mpFarmers.isActive, filters.isActive));
    if (filters.search) {
      conds.push(or(ilike(mpFarmers.name, `%${filters.search}%`), ilike(mpFarmers.code, `%${filters.search}%`))!);
    }
    if (filters.nodeId) {
      conds.push(sql`EXISTS (SELECT 1 FROM ${mpFarmerMemberships} m
        WHERE m.farmer_id = ${mpFarmers.id} AND m.node_id = ${filters.nodeId} AND m.left_on IS NULL)`);
    }
    const scope = scopeFarmers(principal);
    if (scope) conds.push(scope);
    return and(...conds);
  }

  private async assertCodeFree(code: string): Promise<void> {
    const [existing] = await this.db.select({ id: mpFarmers.id }).from(mpFarmers)
      .where(and(eq(mpFarmers.tenantId, this.tenantId), eq(mpFarmers.code, code)));
    if (existing) throw new ConflictError(`Farmer code "${code}" already exists`);
  }
}
