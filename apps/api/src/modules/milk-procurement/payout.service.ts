import { and, eq, desc, sql, gte, lte, inArray, isNull } from 'drizzle-orm';
import {
  mpPayoutCycles, mpPayoutLines, mpPayoutDeductions, mpFarmerLedger,
  mpPours, mpFarmers, mpFarmerMemberships, mpNodes, mpGlSettings, payments,
} from '@runq/db';
import type { Db, MpPayoutCycleRow, MpPayoutLineRow } from '@runq/db';
import { applyPagination, calcTotalPages } from '@runq/db';
import type { PaginationMeta } from '@runq/types';
import type {
  CreateLedgerEntryInput, CreatePayoutCycleInput, PayoutCycleFilter,
} from '@runq/validators';
import { ConflictError, NotFoundError } from '../../utils/errors';
import { nextDocNo } from './numbering';
import { MpPrincipal } from './access-scope';

type LedgerRow = typeof mpFarmerLedger.$inferSelect;
type DeductionRow = typeof mpPayoutDeductions.$inferSelect;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface CycleDetail extends MpPayoutCycleRow {
  lines: (MpPayoutLineRow & { deductions: DeductionRow[] })[];
}

/**
 * Payout — farmer ledger (advances/feed-loans), cycle generation from pours,
 * deductions, lock (posts repayment ledger entries), and pay (direct/via-VMCC).
 * GL posting on lock is deferred to CoA sign-off (tracker C3) — journal_entry_id
 * stays null for now.
 */
export class PayoutService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  // ── farmer ledger ────────────────────────────────────────────────────

  async addLedgerEntry(input: CreateLedgerEntryInput, userId?: string): Promise<LedgerRow> {
    return this.db.transaction(async (tx) => {
      const prev = await this.balanceTx(tx, input.farmerId);
      const given = input.entryType === 'advance_given' || input.entryType === 'feed_loan_given';
      const balanceAfter = round2(prev + (given ? input.amount : -input.amount));
      const [row] = await tx.insert(mpFarmerLedger).values({
        tenantId: this.tenantId,
        farmerId: input.farmerId,
        entryType: input.entryType,
        amount: String(input.amount),
        balanceAfter: String(balanceAfter),
        refType: input.refType ?? null,
        occurredOn: input.occurredOn,
        createdBy: userId ?? null,
      }).returning();
      return row!;
    });
  }

  async ledgerForFarmer(
    farmerId: string | undefined,
    principal: MpPrincipal,
  ): Promise<{ balance: number; entries: LedgerRow[] }> {
    // a farmer can only read their own ledger, whatever they ask for
    const effectiveFarmerId = principal.kind === 'farmer' ? principal.farmerId : farmerId;
    if (!effectiveFarmerId) throw new NotFoundError('farmerId is required');
    const entries = await this.db.select().from(mpFarmerLedger)
      .where(and(eq(mpFarmerLedger.tenantId, this.tenantId), eq(mpFarmerLedger.farmerId, effectiveFarmerId)))
      .orderBy(desc(mpFarmerLedger.occurredOn), desc(mpFarmerLedger.createdAt));
    return { balance: entries[0] ? Number(entries[0].balanceAfter) : 0, entries };
  }

  private async balanceTx(tx: Tx, farmerId: string): Promise<number> {
    const [last] = await tx.select({ b: mpFarmerLedger.balanceAfter }).from(mpFarmerLedger)
      .where(and(eq(mpFarmerLedger.tenantId, this.tenantId), eq(mpFarmerLedger.farmerId, farmerId)))
      .orderBy(desc(mpFarmerLedger.createdAt)).limit(1);
    return last ? Number(last.b) : 0;
  }

  private async outstandingByType(farmerId: string): Promise<{ advance: number; feedLoan: number }> {
    const rows = await this.db.select({
      entryType: mpFarmerLedger.entryType, refType: mpFarmerLedger.refType, amount: mpFarmerLedger.amount,
    }).from(mpFarmerLedger)
      .where(and(eq(mpFarmerLedger.tenantId, this.tenantId), eq(mpFarmerLedger.farmerId, farmerId)));
    let advance = 0, feedLoan = 0;
    for (const r of rows) {
      const amt = Number(r.amount);
      if (r.entryType === 'advance_given') advance += amt;
      else if (r.entryType === 'feed_loan_given') feedLoan += amt;
      else if (r.entryType === 'repayment') {
        if (r.refType === 'cattle_feed_loan') feedLoan -= amt; else advance -= amt;
      }
    }
    return { advance: Math.max(0, round2(advance)), feedLoan: Math.max(0, round2(feedLoan)) };
  }

  // ── cycles ───────────────────────────────────────────────────────────

  async listCycles(
    filters: PayoutCycleFilter,
    pagination: { page: number; limit: number },
  ): Promise<{ data: MpPayoutCycleRow[]; meta: PaginationMeta }> {
    const { page, limit } = pagination;
    const { offset } = applyPagination(page, limit);
    const conds = [eq(mpPayoutCycles.tenantId, this.tenantId)];
    if (filters.status) conds.push(eq(mpPayoutCycles.status, filters.status));
    if (filters.scopeNodeId) conds.push(eq(mpPayoutCycles.scopeNodeId, filters.scopeNodeId));
    const where = and(...conds);
    const [rows, countResult] = await Promise.all([
      this.db.select().from(mpPayoutCycles).where(where)
        .orderBy(desc(mpPayoutCycles.periodStart)).limit(limit).offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(mpPayoutCycles).where(where),
    ]);
    const total = countResult[0]?.count ?? 0;
    return { data: rows, meta: { page, limit, total, totalPages: calcTotalPages(total, limit) } };
  }

  async createCycle(input: CreatePayoutCycleInput): Promise<CycleDetail> {
    const aggregates = await this.pourAggregates(input.periodStart, input.periodEnd, input.scopeNodeId ?? null);
    if (!aggregates.length) throw new ConflictError('No recorded collections in this period/scope');
    const cycleId = await this.db.transaction(async (tx) => {
      const cycleNo = await nextDocNo(tx, this.tenantId, 'cycle', input.periodStart, 'CYC');
      const [cycle] = await tx.insert(mpPayoutCycles).values({
        tenantId: this.tenantId, cycleNo, scopeNodeId: input.scopeNodeId ?? null,
        periodStart: input.periodStart, periodEnd: input.periodEnd, status: 'open',
      }).returning({ id: mpPayoutCycles.id });
      for (const a of aggregates) {
        const ded = await this.computeDeductions(a.farmerId, a.gross);
        const statementNo = await nextDocNo(tx, this.tenantId, 'statement', input.periodStart, 'STM');
        const [line] = await tx.insert(mpPayoutLines).values({
          tenantId: this.tenantId, payoutCycleId: cycle!.id, farmerId: a.farmerId,
          qtyLitres: String(a.qty), grossAmount: String(a.gross), bonusAmount: String(a.bonus),
          deductionTotal: String(ded.total), netAmount: String(round2(a.gross - ded.total)), statementNo,
        }).returning({ id: mpPayoutLines.id });
        await this.insertDeductions(tx, line!.id, ded);
      }
      return cycle!.id;
    });
    return this.getCycle(cycleId);
  }

  async getCycle(id: string): Promise<CycleDetail> {
    const [cycle] = await this.db.select().from(mpPayoutCycles)
      .where(and(eq(mpPayoutCycles.tenantId, this.tenantId), eq(mpPayoutCycles.id, id)));
    if (!cycle) throw new NotFoundError('Payout cycle not found');
    const lines = await this.db.select().from(mpPayoutLines)
      .where(and(eq(mpPayoutLines.tenantId, this.tenantId), eq(mpPayoutLines.payoutCycleId, id)));
    const lineIds = lines.map((l) => l.id);
    const deds = lineIds.length
      ? await this.db.select().from(mpPayoutDeductions).where(inArray(mpPayoutDeductions.payoutLineId, lineIds))
      : [];
    const byLine = new Map<string, DeductionRow[]>();
    for (const d of deds) byLine.set(d.payoutLineId, [...(byLine.get(d.payoutLineId) ?? []), d]);
    return { ...cycle, lines: lines.map((l) => ({ ...l, deductions: byLine.get(l.id) ?? [] })) };
  }

  async lockCycle(id: string): Promise<MpPayoutCycleRow> {
    const cycle = await this.requireStatus(id, 'open');
    const lines = await this.db.select().from(mpPayoutLines)
      .where(and(eq(mpPayoutLines.tenantId, this.tenantId), eq(mpPayoutLines.payoutCycleId, id)));
    const totals = lines.reduce((a, l) => ({
      qty: a.qty + Number(l.qtyLitres), gross: a.gross + Number(l.grossAmount),
      ded: a.ded + Number(l.deductionTotal), net: a.net + Number(l.netAmount),
    }), { qty: 0, gross: 0, ded: 0, net: 0 });
    return this.db.transaction(async (tx) => {
      await this.postRepayments(tx, cycle, lines);
      const [updated] = await tx.update(mpPayoutCycles).set({
        status: 'locked', lockedAt: new Date(),
        totalQty: String(round3(totals.qty)), totalGross: String(round2(totals.gross)),
        totalDeductions: String(round2(totals.ded)), totalNet: String(round2(totals.net)),
        updatedAt: new Date(),
      }).where(and(eq(mpPayoutCycles.tenantId, this.tenantId), eq(mpPayoutCycles.id, id))).returning();
      return updated!;
    });
  }

  async payCycle(id: string): Promise<MpPayoutCycleRow> {
    const cycle = await this.requireStatus(id, 'locked');
    const lines = await this.db.select({
      lineId: mpPayoutLines.id, farmerId: mpPayoutLines.farmerId,
      vendorId: mpFarmers.vendorId, netAmount: mpPayoutLines.netAmount,
    }).from(mpPayoutLines).innerJoin(mpFarmers, eq(mpFarmers.id, mpPayoutLines.farmerId))
      .where(and(eq(mpPayoutLines.tenantId, this.tenantId), eq(mpPayoutLines.payoutCycleId, id)));
    const mode = await this.resolvePayoutMode(cycle.scopeNodeId);
    return this.db.transaction(async (tx) => {
      if (mode === 'via_vmcc') await this.payViaVmcc(tx, cycle, lines);
      else await this.payDirect(tx, cycle, lines);
      const [updated] = await tx.update(mpPayoutCycles)
        .set({ status: 'paid', paidAt: new Date(), updatedAt: new Date() })
        .where(and(eq(mpPayoutCycles.tenantId, this.tenantId), eq(mpPayoutCycles.id, id))).returning();
      return updated!;
    });
  }

  // ── helpers ──────────────────────────────────────────────────────────

  private async pourAggregates(start: string, end: string, scopeNodeId: string | null) {
    const conds = [
      eq(mpPours.tenantId, this.tenantId), eq(mpPours.status, 'recorded'),
      gte(mpPours.collectionDate, start), lte(mpPours.collectionDate, end),
    ];
    if (scopeNodeId) conds.push(eq(mpPours.nodeId, scopeNodeId));
    const rows = await this.db.select({
      farmerId: mpPours.farmerId,
      qty: sql<string>`sum(${mpPours.qtyLitres})`,
      gross: sql<string>`sum(${mpPours.lineAmount})`,
      bonus: sql<string>`sum(${mpPours.bonusAmount})`,
    }).from(mpPours).where(and(...conds)).groupBy(mpPours.farmerId);
    return rows.map((r) => ({ farmerId: r.farmerId, qty: Number(r.qty), gross: Number(r.gross), bonus: Number(r.bonus) }));
  }

  private async computeDeductions(farmerId: string, gross: number) {
    const out = await this.outstandingByType(farmerId);
    let remaining = gross;
    const advance = Math.min(out.advance, remaining); remaining -= advance;
    const feedLoan = Math.min(out.feedLoan, remaining);
    return { advance: round2(advance), feedLoan: round2(feedLoan), total: round2(advance + feedLoan) };
  }

  private async insertDeductions(tx: Tx, lineId: string, ded: { advance: number; feedLoan: number }) {
    if (ded.advance > 0) {
      await tx.insert(mpPayoutDeductions).values({
        tenantId: this.tenantId, payoutLineId: lineId, deductionType: 'advance', amount: String(ded.advance),
      });
    }
    if (ded.feedLoan > 0) {
      await tx.insert(mpPayoutDeductions).values({
        tenantId: this.tenantId, payoutLineId: lineId, deductionType: 'cattle_feed_loan', amount: String(ded.feedLoan),
      });
    }
  }

  private async postRepayments(tx: Tx, cycle: MpPayoutCycleRow, lines: MpPayoutLineRow[]) {
    const lineIds = lines.map((l) => l.id);
    if (!lineIds.length) return;
    const deds = await tx.select().from(mpPayoutDeductions).where(inArray(mpPayoutDeductions.payoutLineId, lineIds));
    const farmerByLine = new Map(lines.map((l) => [l.id, l.farmerId]));
    for (const d of deds) {
      const farmerId = farmerByLine.get(d.payoutLineId)!;
      const prev = await this.balanceTx(tx, farmerId);
      await tx.insert(mpFarmerLedger).values({
        tenantId: this.tenantId, farmerId, entryType: 'repayment', amount: d.amount,
        balanceAfter: String(round2(prev - Number(d.amount))),
        refType: d.deductionType === 'cattle_feed_loan' ? 'cattle_feed_loan' : 'advance',
        refId: d.payoutLineId, occurredOn: cycle.periodEnd,
      });
    }
  }

  private async payDirect(
    tx: Tx, cycle: MpPayoutCycleRow,
    lines: { lineId: string; vendorId: string; netAmount: string }[],
  ) {
    for (const l of lines) {
      if (Number(l.netAmount) <= 0) continue;
      const [pay] = await tx.insert(payments).values({
        tenantId: this.tenantId, vendorId: l.vendorId, paymentDate: cycle.periodEnd, amount: l.netAmount,
      }).returning({ id: payments.id });
      await tx.update(mpPayoutLines).set({ paymentId: pay!.id }).where(eq(mpPayoutLines.id, l.lineId));
    }
  }

  private async payViaVmcc(
    tx: Tx, cycle: MpPayoutCycleRow,
    lines: { lineId: string; farmerId: string; netAmount: string }[],
  ) {
    const farmerIds = lines.map((l) => l.farmerId);
    const mems = await tx.select({ farmerId: mpFarmerMemberships.farmerId, nodeId: mpFarmerMemberships.nodeId })
      .from(mpFarmerMemberships).where(and(
        eq(mpFarmerMemberships.tenantId, this.tenantId), inArray(mpFarmerMemberships.farmerId, farmerIds),
        isNull(mpFarmerMemberships.leftOn), eq(mpFarmerMemberships.isPrimary, true),
      ));
    const nodeByFarmer = new Map(mems.map((m) => [m.farmerId, m.nodeId]));
    const byNode = new Map<string, { sum: number; lineIds: string[] }>();
    for (const l of lines) {
      const nodeId = nodeByFarmer.get(l.farmerId);
      if (!nodeId) throw new ConflictError(`Farmer ${l.farmerId} has no primary VMCC for via_vmcc payout`);
      const g = byNode.get(nodeId) ?? { sum: 0, lineIds: [] };
      g.sum += Number(l.netAmount); g.lineIds.push(l.lineId);
      byNode.set(nodeId, g);
    }
    for (const [nodeId, g] of byNode) {
      const [node] = await tx.select({ payee: mpNodes.payeeVendorId }).from(mpNodes).where(eq(mpNodes.id, nodeId));
      if (!node?.payee) throw new ConflictError(`VMCC ${nodeId} has no payee vendor`);
      const [pay] = await tx.insert(payments).values({
        tenantId: this.tenantId, vendorId: node.payee, paymentDate: cycle.periodEnd, amount: String(round2(g.sum)),
      }).returning({ id: payments.id });
      await tx.update(mpPayoutLines).set({ paymentId: pay!.id, settledViaNodeId: nodeId })
        .where(inArray(mpPayoutLines.id, g.lineIds));
    }
  }

  private async resolvePayoutMode(scopeNodeId: string | null): Promise<'direct_to_farmer' | 'via_vmcc'> {
    if (scopeNodeId) {
      const [n] = await this.db.select({ m: mpNodes.payoutMode }).from(mpNodes)
        .where(and(eq(mpNodes.tenantId, this.tenantId), eq(mpNodes.id, scopeNodeId)));
      if (n?.m) return n.m;
    }
    const [s] = await this.db.select({ m: mpGlSettings.defaultPayoutMode }).from(mpGlSettings)
      .where(eq(mpGlSettings.tenantId, this.tenantId));
    return s?.m ?? 'direct_to_farmer';
  }

  private async requireStatus(id: string, status: MpPayoutCycleRow['status']): Promise<MpPayoutCycleRow> {
    const [cycle] = await this.db.select().from(mpPayoutCycles)
      .where(and(eq(mpPayoutCycles.tenantId, this.tenantId), eq(mpPayoutCycles.id, id)));
    if (!cycle) throw new NotFoundError('Payout cycle not found');
    if (cycle.status !== status) throw new ConflictError(`Cycle is ${cycle.status}, expected ${status}`);
    return cycle;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
