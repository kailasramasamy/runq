import { and, eq, desc, sql, or, isNull, lte, gte } from 'drizzle-orm';
import { mpNodeOperators, mpPours } from '@runq/db';
import type { Db } from '@runq/db';
import { applyPagination, calcTotalPages } from '@runq/db';
import type { PaginationMeta } from '@runq/types';
import type {
  CreateNodeOperatorInput, NodeOperatorFilter, OperatorCompQuery,
} from '@runq/validators';
import { NotFoundError } from '../../utils/errors';

type OperatorRow = typeof mpNodeOperators.$inferSelect;

export interface OperatorComp {
  nodeId: string;
  from: string;
  to: string;
  nodeQty: number;
  operators: {
    id: string; role: string; compType: string;
    commission: number; salary: number; rent: number; total: number;
  }[];
}

/** Node operators (comp terms) + commission computed from pour volume. */
export class NodeOperatorService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async list(
    filters: NodeOperatorFilter,
    pagination: { page: number; limit: number },
  ): Promise<{ data: OperatorRow[]; meta: PaginationMeta }> {
    const { page, limit } = pagination;
    const { offset } = applyPagination(page, limit);
    const conds = [eq(mpNodeOperators.tenantId, this.tenantId)];
    if (filters.nodeId) conds.push(eq(mpNodeOperators.nodeId, filters.nodeId));
    if (filters.isActive !== undefined) conds.push(eq(mpNodeOperators.isActive, filters.isActive));
    const where = and(...conds);
    const [rows, countResult] = await Promise.all([
      this.db.select().from(mpNodeOperators).where(where)
        .orderBy(desc(mpNodeOperators.effectiveFrom), desc(mpNodeOperators.createdAt)).limit(limit).offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(mpNodeOperators).where(where),
    ]);
    const total = countResult[0]?.count ?? 0;
    return { data: rows, meta: { page, limit, total, totalPages: calcTotalPages(total, limit) } };
  }

  async getById(id: string): Promise<OperatorRow> {
    const [row] = await this.db.select().from(mpNodeOperators)
      .where(and(eq(mpNodeOperators.tenantId, this.tenantId), eq(mpNodeOperators.id, id)));
    if (!row) throw new NotFoundError('Node operator not found');
    return row;
  }

  async create(input: CreateNodeOperatorInput): Promise<OperatorRow> {
    return this.db.transaction(async (tx) => {
      // Latest term supersedes: close any open active term for this node+role so
      // only the newest comp arrangement is counted by the commission calculator.
      await tx.update(mpNodeOperators)
        .set({ isActive: false, effectiveTo: input.effectiveFrom, updatedAt: new Date() })
        .where(and(
          eq(mpNodeOperators.tenantId, this.tenantId),
          eq(mpNodeOperators.nodeId, input.nodeId),
          eq(mpNodeOperators.role, input.role),
          eq(mpNodeOperators.isActive, true),
        ));
      const [row] = await tx.insert(mpNodeOperators).values({
        tenantId: this.tenantId,
        nodeId: input.nodeId,
        userId: input.userId ?? null,
        payeeVendorId: input.payeeVendorId ?? null,
        role: input.role,
        compType: input.compType,
        ratePerLitre: numOrNull(input.ratePerLitre),
        monthlySalary: numOrNull(input.monthlySalary),
        rentAmount: numOrNull(input.rentAmount),
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo ?? null,
      }).returning();
      return row!;
    });
  }

  async deactivate(id: string): Promise<OperatorRow> {
    await this.getById(id);
    const [row] = await this.db.update(mpNodeOperators)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(mpNodeOperators.tenantId, this.tenantId), eq(mpNodeOperators.id, id))).returning();
    return row!;
  }

  /** Commission = node pour volume in period × per-litre rate; + salary/rent. */
  async computeComp(q: OperatorCompQuery): Promise<OperatorComp> {
    const ops = await this.db.select().from(mpNodeOperators).where(and(
      eq(mpNodeOperators.tenantId, this.tenantId),
      eq(mpNodeOperators.nodeId, q.nodeId),
      eq(mpNodeOperators.isActive, true),
      lte(mpNodeOperators.effectiveFrom, q.to),
      or(isNull(mpNodeOperators.effectiveTo), gte(mpNodeOperators.effectiveTo, q.from)),
    ));
    const [agg] = await this.db.select({ qty: sql<string>`coalesce(sum(${mpPours.qtyLitres}), 0)` })
      .from(mpPours).where(and(
        eq(mpPours.tenantId, this.tenantId), eq(mpPours.nodeId, q.nodeId), eq(mpPours.status, 'recorded'),
        gte(mpPours.collectionDate, q.from), lte(mpPours.collectionDate, q.to),
      ));
    const nodeQty = Number(agg?.qty ?? 0);
    const operators = ops.map((o) => {
      const commission = o.compType === 'per_litre_commission' && o.ratePerLitre
        ? round2(nodeQty * Number(o.ratePerLitre)) : 0;
      const salary = o.compType === 'fixed_salary' && o.monthlySalary ? Number(o.monthlySalary) : 0;
      const rent = o.rentAmount ? Number(o.rentAmount) : 0;
      return { id: o.id, role: o.role, compType: o.compType, commission, salary, rent, total: round2(commission + salary + rent) };
    });
    return { nodeId: q.nodeId, from: q.from, to: q.to, nodeQty, operators };
  }
}

function numOrNull(v: number | null | undefined): string | null {
  return v != null ? String(v) : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
