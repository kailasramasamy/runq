import { and, eq, desc, sql } from 'drizzle-orm';
import { mpQcTests } from '@runq/db';
import type { Db } from '@runq/db';
import { applyPagination, calcTotalPages } from '@runq/db';
import type { PaginationMeta } from '@runq/types';
import type { CreateQcTestInput, QcTestFilter } from '@runq/validators';
import { NotFoundError } from '../../utils/errors';

type QcRow = typeof mpQcTests.$inferSelect;

/** QC tests bound to a pour or consignment. */
export class QcTestService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async list(
    filters: QcTestFilter,
    pagination: { page: number; limit: number },
  ): Promise<{ data: QcRow[]; meta: PaginationMeta }> {
    const { page, limit } = pagination;
    const { offset } = applyPagination(page, limit);
    const where = this.buildWhere(filters);
    const [rows, countResult] = await Promise.all([
      this.db.select().from(mpQcTests).where(where)
        .orderBy(desc(mpQcTests.createdAt)).limit(limit).offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(mpQcTests).where(where),
    ]);
    const total = countResult[0]?.count ?? 0;
    return { data: rows, meta: { page, limit, total, totalPages: calcTotalPages(total, limit) } };
  }

  async getById(id: string): Promise<QcRow> {
    const [row] = await this.db.select().from(mpQcTests)
      .where(and(eq(mpQcTests.tenantId, this.tenantId), eq(mpQcTests.id, id)));
    if (!row) throw new NotFoundError('QC test not found');
    return row;
  }

  async create(input: CreateQcTestInput, userId?: string): Promise<QcRow> {
    const [row] = await this.db.insert(mpQcTests).values({
      tenantId: this.tenantId,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      testCode: input.testCode,
      value: input.value ?? null,
      uom: input.uom ?? null,
      verdict: input.verdict ?? null,
      testedAt: new Date(),
      testedBy: userId ?? null,
    }).returning();
    return row!;
  }

  private buildWhere(filters: QcTestFilter) {
    const conds = [eq(mpQcTests.tenantId, this.tenantId)];
    if (filters.subjectType) conds.push(eq(mpQcTests.subjectType, filters.subjectType));
    if (filters.subjectId) conds.push(eq(mpQcTests.subjectId, filters.subjectId));
    if (filters.verdict) conds.push(eq(mpQcTests.verdict, filters.verdict));
    return and(...conds);
  }
}
