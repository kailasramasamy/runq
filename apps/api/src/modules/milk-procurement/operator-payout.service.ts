import { and, eq, sql, or, isNull, lte, gte, desc, inArray } from 'drizzle-orm';
import { mpNodeOperators, mpOperatorPayouts, mpPours, mpNodes } from '@runq/db';
import type { Db, MpOperatorPayoutRow } from '@runq/db';
import { applyPagination, calcTotalPages } from '@runq/db';
import type { PaginationMeta } from '@runq/types';
import type {
  OperatorPayoutComputeQuery, CreateOperatorPayoutInput, OperatorPayoutFilter,
} from '@runq/validators';
import { ConflictError, NotFoundError } from '../../utils/errors';
import { MpPrincipal, assertNodeAccess } from './access-scope';

export interface OperatorPayoutLine {
  operatorId: string; nodeId: string; nodeName: string; name: string | null;
  role: string; compType: string;
  nodeQty: number; commission: number; salary: number; rent: number; total: number;
  paidPayoutId: string | null; paidOn: string | null;
}

/** Lightweight operator-payout: derive what's owed per period, record what's paid. */
export class OperatorPayoutService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  /** What each active operator is owed for the period; flags any already paid. */
  async compute(
    q: OperatorPayoutComputeQuery, principal?: MpPrincipal,
  ): Promise<{ from: string; to: string; lines: OperatorPayoutLine[] }> {
    const conds = [
      eq(mpNodeOperators.tenantId, this.tenantId),
      eq(mpNodeOperators.isActive, true),
      lte(mpNodeOperators.effectiveFrom, q.to),
      or(isNull(mpNodeOperators.effectiveTo), gte(mpNodeOperators.effectiveTo, q.from)),
    ];
    if (q.nodeId) conds.push(eq(mpNodeOperators.nodeId, q.nodeId));
    // A CC/PP manager only sees operators within its own subtree.
    if (principal?.kind === 'operator') {
      conds.push(principal.nodeIds.size
        ? inArray(mpNodeOperators.nodeId, [...principal.nodeIds]) : sql`false`);
    }
    const ops = await this.db.select({
      id: mpNodeOperators.id, nodeId: mpNodeOperators.nodeId, role: mpNodeOperators.role,
      compType: mpNodeOperators.compType, ratePerLitre: mpNodeOperators.ratePerLitre,
      monthlySalary: mpNodeOperators.monthlySalary, rentAmount: mpNodeOperators.rentAmount,
      nodeName: mpNodes.name, name: mpNodeOperators.name,
    }).from(mpNodeOperators).innerJoin(mpNodes, eq(mpNodes.id, mpNodeOperators.nodeId)).where(and(...conds));
    if (ops.length === 0) return { from: q.from, to: q.to, lines: [] };

    const vol = await this.volumeByNode([...new Set(ops.map((o) => o.nodeId))], q.from, q.to);
    const paid = await this.paidByOperator(ops.map((o) => o.id), q.from, q.to);
    const lines = ops.map((o) => {
      const c = comp(o, vol.get(o.nodeId) ?? 0);
      const p = paid.get(o.id);
      return {
        operatorId: o.id, nodeId: o.nodeId, nodeName: o.nodeName, name: o.name,
        role: o.role, compType: o.compType,
        ...c, paidPayoutId: p?.id ?? null, paidOn: p?.paidOn ?? null,
      };
    });
    return { from: q.from, to: q.to, lines };
  }

  /** Record a payout for one operator + period (amounts recomputed server-side). */
  async markPaid(
    input: CreateOperatorPayoutInput, today: string, principal?: MpPrincipal,
  ): Promise<MpOperatorPayoutRow> {
    const [op] = await this.db.select().from(mpNodeOperators)
      .where(and(eq(mpNodeOperators.tenantId, this.tenantId), eq(mpNodeOperators.id, input.operatorId)));
    if (!op) throw new NotFoundError('Operator not found');
    if (principal?.kind === 'operator') assertNodeAccess(principal, op.nodeId);
    const [existing] = await this.db.select({ id: mpOperatorPayouts.id }).from(mpOperatorPayouts).where(and(
      eq(mpOperatorPayouts.tenantId, this.tenantId), eq(mpOperatorPayouts.operatorId, op.id),
      eq(mpOperatorPayouts.periodStart, input.periodStart), eq(mpOperatorPayouts.periodEnd, input.periodEnd),
    ));
    if (existing) throw new ConflictError('This operator is already paid for this period');

    const vol = (await this.volumeByNode([op.nodeId], input.periodStart, input.periodEnd)).get(op.nodeId) ?? 0;
    const c = comp(op, vol);
    const [row] = await this.db.insert(mpOperatorPayouts).values({
      tenantId: this.tenantId, operatorId: op.id, nodeId: op.nodeId,
      periodStart: input.periodStart, periodEnd: input.periodEnd,
      nodeQty: String(c.nodeQty), commission: String(c.commission), salary: String(c.salary),
      rent: String(c.rent), total: String(c.total), payeeVendorId: op.payeeVendorId,
      paidOn: input.paidOn ?? today, reference: input.reference ?? null,
    }).returning();
    return row!;
  }

  async list(
    filters: OperatorPayoutFilter,
    pagination: { page: number; limit: number },
    principal?: MpPrincipal,
  ): Promise<{ data: MpOperatorPayoutRow[]; meta: PaginationMeta }> {
    const { page, limit } = pagination;
    const { offset } = applyPagination(page, limit);
    const conds = [eq(mpOperatorPayouts.tenantId, this.tenantId)];
    if (filters.nodeId) conds.push(eq(mpOperatorPayouts.nodeId, filters.nodeId));
    if (filters.operatorId) conds.push(eq(mpOperatorPayouts.operatorId, filters.operatorId));
    if (filters.from) conds.push(gte(mpOperatorPayouts.periodStart, filters.from));
    if (filters.to) conds.push(lte(mpOperatorPayouts.periodEnd, filters.to));
    if (principal?.kind === 'operator') {
      conds.push(principal.nodeIds.size
        ? inArray(mpOperatorPayouts.nodeId, [...principal.nodeIds]) : sql`false`);
    }
    const where = and(...conds);
    const [rows, countResult] = await Promise.all([
      this.db.select().from(mpOperatorPayouts).where(where)
        .orderBy(desc(mpOperatorPayouts.paidOn), desc(mpOperatorPayouts.createdAt)).limit(limit).offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(mpOperatorPayouts).where(where),
    ]);
    const total = countResult[0]?.count ?? 0;
    return { data: rows, meta: { page, limit, total, totalPages: calcTotalPages(total, limit) } };
  }

  private async volumeByNode(nodeIds: string[], from: string, to: string): Promise<Map<string, number>> {
    if (nodeIds.length === 0) return new Map();
    const rows = await this.db.select({
      nodeId: mpPours.nodeId, qty: sql<string>`coalesce(sum(${mpPours.qtyLitres}), 0)`,
    }).from(mpPours).where(and(
      eq(mpPours.tenantId, this.tenantId), inArray(mpPours.nodeId, nodeIds), eq(mpPours.status, 'recorded'),
      gte(mpPours.collectionDate, from), lte(mpPours.collectionDate, to),
    )).groupBy(mpPours.nodeId);
    return new Map(rows.map((r) => [r.nodeId, Number(r.qty)]));
  }

  private async paidByOperator(operatorIds: string[], from: string, to: string): Promise<Map<string, { id: string; paidOn: string }>> {
    if (operatorIds.length === 0) return new Map();
    const rows = await this.db.select({
      id: mpOperatorPayouts.id, operatorId: mpOperatorPayouts.operatorId, paidOn: mpOperatorPayouts.paidOn,
    }).from(mpOperatorPayouts).where(and(
      eq(mpOperatorPayouts.tenantId, this.tenantId), inArray(mpOperatorPayouts.operatorId, operatorIds),
      eq(mpOperatorPayouts.periodStart, from), eq(mpOperatorPayouts.periodEnd, to),
    ));
    return new Map(rows.map((r) => [r.operatorId, { id: r.id, paidOn: r.paidOn }]));
  }
}

type CompTerms = { compType: string; ratePerLitre: string | null; monthlySalary: string | null; rentAmount: string | null };

/** commission = volume × per-litre rate; + fixed salary; + rent. */
function comp(o: CompTerms, nodeQty: number): { nodeQty: number; commission: number; salary: number; rent: number; total: number } {
  const commission = o.compType === 'per_litre_commission' && o.ratePerLitre ? round2(nodeQty * Number(o.ratePerLitre)) : 0;
  const salary = o.compType === 'fixed_salary' && o.monthlySalary ? Number(o.monthlySalary) : 0;
  const rent = o.rentAmount ? Number(o.rentAmount) : 0;
  return { nodeQty, commission, salary, rent, total: round2(commission + salary + rent) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
