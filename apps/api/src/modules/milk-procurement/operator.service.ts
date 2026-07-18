import { and, eq, desc, sql, or, isNull, lte, gte } from 'drizzle-orm';
import { mpNodeOperators, mpNodes, mpPours, mpOperatorPayouts } from '@runq/db';
import type { Db } from '@runq/db';
import { applyPagination, calcTotalPages } from '@runq/db';
import type { PaginationMeta } from '@runq/types';
import type {
  CreateNodeOperatorInput, UpdateNodeOperatorInput, NodeOperatorFilter, OperatorCompQuery,
} from '@runq/validators';
import { ConflictError, NotFoundError } from '../../utils/errors';
import { upsertCredential } from './credentials.service';

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

export interface OperatorSelf {
  id: string; nodeId: string; nodeName: string; name: string | null; role: string; compType: string;
  ratePerLitre: string | null; monthlySalary: string | null; rentAmount: string | null;
  effectiveFrom: string; hasPayee: boolean;
  periodStart: string; periodEnd: string; monthQty: number; monthEarning: number;
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

  /**
   * The signed-in operator's OWN active comp arrangement(s), matched by
   * `user_id` — strictly self-scoped so a field_operator can read their payout
   * terms without the owner/accountant operator-admin endpoints. Includes the
   * node name, whether a payee is on file, and this calendar month's earning.
   */
  async self(userId: string, today: string): Promise<OperatorSelf[]> {
    const monthStart = `${today.slice(0, 7)}-01`;
    const rows = await this.db.select({
      id: mpNodeOperators.id, nodeId: mpNodeOperators.nodeId, nodeName: mpNodes.name,
      name: mpNodeOperators.name,
      role: mpNodeOperators.role, compType: mpNodeOperators.compType,
      ratePerLitre: mpNodeOperators.ratePerLitre, monthlySalary: mpNodeOperators.monthlySalary,
      rentAmount: mpNodeOperators.rentAmount, effectiveFrom: mpNodeOperators.effectiveFrom,
      payeeVendorId: mpNodeOperators.payeeVendorId,
    }).from(mpNodeOperators).innerJoin(mpNodes, eq(mpNodes.id, mpNodeOperators.nodeId))
      .where(and(
        eq(mpNodeOperators.tenantId, this.tenantId),
        eq(mpNodeOperators.userId, userId),
        eq(mpNodeOperators.isActive, true),
      ));

    const out: OperatorSelf[] = [];
    for (const o of rows) {
      const qty = await this.nodeVolume(o.nodeId, monthStart, today);
      const commission = o.compType === 'per_litre_commission' && o.ratePerLitre
        ? round2(qty * Number(o.ratePerLitre)) : 0;
      const salary = o.compType === 'fixed_salary' && o.monthlySalary ? Number(o.monthlySalary) : 0;
      const rent = o.rentAmount ? Number(o.rentAmount) : 0;
      out.push({
        id: o.id, nodeId: o.nodeId, nodeName: o.nodeName, name: o.name, role: o.role, compType: o.compType,
        ratePerLitre: o.ratePerLitre, monthlySalary: o.monthlySalary, rentAmount: o.rentAmount,
        effectiveFrom: o.effectiveFrom, hasPayee: o.payeeVendorId != null,
        periodStart: monthStart, periodEnd: today, monthQty: qty, monthEarning: round2(commission + salary + rent),
      });
    }
    return out;
  }

  private async nodeVolume(nodeId: string, from: string, to: string): Promise<number> {
    const [agg] = await this.db.select({ qty: sql<string>`coalesce(sum(${mpPours.qtyLitres}), 0)` })
      .from(mpPours).where(and(
        eq(mpPours.tenantId, this.tenantId), eq(mpPours.nodeId, nodeId), eq(mpPours.status, 'recorded'),
        gte(mpPours.collectionDate, from), lte(mpPours.collectionDate, to),
      ));
    return Number(agg?.qty ?? 0);
  }

  async getById(id: string): Promise<OperatorRow> {
    const [row] = await this.db.select().from(mpNodeOperators)
      .where(and(eq(mpNodeOperators.tenantId, this.tenantId), eq(mpNodeOperators.id, id)));
    if (!row) throw new NotFoundError('Node operator not found');
    return row;
  }

  async create(input: CreateNodeOperatorInput): Promise<OperatorRow> {
    return this.db.transaction(async (tx) => {
      // A node may carry several operators. "Latest term supersedes" applies only
      // within the SAME operator (matched by linked user, else login phone) + role,
      // so re-adding one person closes their prior comp term while distinct
      // operators on the node coexist. With no user/phone to key on, supersede
      // nothing — just add the operator.
      const phoneDigits = input.loginPhone?.replace(/\D/g, '') || null;
      const samePerson = input.userId
        ? eq(mpNodeOperators.userId, input.userId)
        : phoneDigits
          ? sql`regexp_replace(coalesce(${mpNodeOperators.phone}, ''), '\\D', '', 'g') IN (${phoneDigits}, ${'91' + phoneDigits})`
          : null;
      if (samePerson) {
        await tx.update(mpNodeOperators)
          .set({ isActive: false, effectiveTo: input.effectiveFrom, updatedAt: new Date() })
          .where(and(
            eq(mpNodeOperators.tenantId, this.tenantId),
            eq(mpNodeOperators.nodeId, input.nodeId),
            eq(mpNodeOperators.role, input.role),
            eq(mpNodeOperators.isActive, true),
            samePerson,
          ));
      }
      const [row] = await tx.insert(mpNodeOperators).values({
        tenantId: this.tenantId,
        nodeId: input.nodeId,
        userId: input.userId ?? null,
        name: input.name ?? null,
        phone: input.loginPhone ?? null,
        payeeVendorId: input.payeeVendorId ?? null,
        role: input.role,
        compType: input.compType,
        ratePerLitre: numOrNull(input.ratePerLitre),
        monthlySalary: numOrNull(input.monthlySalary),
        rentAmount: numOrNull(input.rentAmount),
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo ?? null,
      }).returning();
      // Provision a Dhenu app login for this operator when phone is given.
      if (input.loginPhone) {
        await upsertCredential(tx, {
          tenantId: this.tenantId, phone: input.loginPhone,
          role: 'field_operator', userId: input.userId ?? null,
        });
      }
      return row!;
    });
  }

  /**
   * Edit a comp term in place. Allowed only while the term has no payout history
   * — once it's been billed, editing would retroactively change past commission,
   * so the caller must supersede it with a new effective term instead (the same
   * guard [remove] uses). Only supplied fields change; a new loginPhone syncs the
   * Dhenu credential as create does.
   */
  async update(id: string, input: UpdateNodeOperatorInput): Promise<OperatorRow> {
    const existing = await this.getById(id);
    const [payout] = await this.db.select({ id: mpOperatorPayouts.id }).from(mpOperatorPayouts)
      .where(and(eq(mpOperatorPayouts.tenantId, this.tenantId), eq(mpOperatorPayouts.operatorId, id))).limit(1);
    if (payout) throw new ConflictError('Operator has payout history — add a new term instead of editing');
    return this.db.transaction(async (tx) => {
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (input.userId !== undefined) patch.userId = input.userId ?? null;
      if (input.name !== undefined) patch.name = input.name ?? null;
      if (input.payeeVendorId !== undefined) patch.payeeVendorId = input.payeeVendorId ?? null;
      if (input.loginPhone !== undefined) patch.phone = input.loginPhone ?? null;
      if (input.role !== undefined) patch.role = input.role;
      if (input.compType !== undefined) patch.compType = input.compType;
      if (input.ratePerLitre !== undefined) patch.ratePerLitre = numOrNull(input.ratePerLitre);
      if (input.monthlySalary !== undefined) patch.monthlySalary = numOrNull(input.monthlySalary);
      if (input.rentAmount !== undefined) patch.rentAmount = numOrNull(input.rentAmount);
      if (input.effectiveFrom !== undefined) patch.effectiveFrom = input.effectiveFrom;
      if (input.effectiveTo !== undefined) patch.effectiveTo = input.effectiveTo ?? null;
      const [row] = await tx.update(mpNodeOperators).set(patch)
        .where(and(eq(mpNodeOperators.tenantId, this.tenantId), eq(mpNodeOperators.id, id))).returning();
      const phone = input.loginPhone !== undefined ? input.loginPhone : existing.phone;
      if (phone) {
        await upsertCredential(tx, {
          tenantId: this.tenantId, phone,
          role: 'field_operator', userId: (patch.userId as string | null) ?? existing.userId ?? null,
        });
      }
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

  /**
   * Hard-delete an operator comp term — for ones added by mistake. Refused once
   * the operator has any payout history (the snapshot rows FK-reference it and
   * stay as the audit trail); end the term instead in that case. The shared
   * Dhenu login (mp_credentials) is left untouched — it may belong to a farmer
   * or another operator row keyed on the same phone.
   */
  async remove(id: string): Promise<void> {
    await this.getById(id);
    const [payout] = await this.db.select({ id: mpOperatorPayouts.id }).from(mpOperatorPayouts)
      .where(and(eq(mpOperatorPayouts.tenantId, this.tenantId), eq(mpOperatorPayouts.operatorId, id))).limit(1);
    if (payout) throw new ConflictError('Operator has payout history — end the term instead of deleting');
    await this.db.delete(mpNodeOperators)
      .where(and(eq(mpNodeOperators.tenantId, this.tenantId), eq(mpNodeOperators.id, id)));
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
