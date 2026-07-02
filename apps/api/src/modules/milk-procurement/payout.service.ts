import { and, eq, desc, ne, or, sql, gte, lte, inArray, isNull } from 'drizzle-orm';
import {
  mpPayoutCycles, mpPayoutLines, mpPayoutDeductions, mpFarmerLedger,
  mpPours, mpFarmers, mpFarmerMemberships, mpNodes, mpGlSettings, mpVmccBills, payments,
} from '@runq/db';
import type { Db, MpPayoutCycleRow, MpPayoutLineRow } from '@runq/db';
import { applyPagination, calcTotalPages } from '@runq/db';
import type { PaginationMeta } from '@runq/types';
import type {
  CreateLedgerEntryInput, CreatePayoutCycleInput, PayoutCycleFilter,
} from '@runq/validators';
import { ConflictError, ForbiddenError, NotFoundError } from '../../utils/errors';
import { nextDocNo } from './numbering';
import { MpGlPoster } from './gl-poster';
import { MpPrincipal, assertNodeAccess, assertFarmerAtNode } from './access-scope';

type LedgerRow = typeof mpFarmerLedger.$inferSelect;
type DeductionRow = typeof mpPayoutDeductions.$inferSelect;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface CycleDetail extends MpPayoutCycleRow {
  lines: (MpPayoutLineRow & { deductions: DeductionRow[] })[];
}

/** Per-cycle line roll-up returned with each row in the cycle list. */
export interface CycleLineAgg {
  lineCount: number;
  paidCount: number;
  netTotal: number;
  paidTotal: number;
}

export type CycleListRow = MpPayoutCycleRow & CycleLineAgg;

/**
 * Payout — farmer ledger (advances/feed-loans), cycle generation from pours,
 * deductions, lock (posts repayment ledger entries), and pay (direct/via-VMCC).
 * GL (expense-basis, P1.1) via MpGlPoster: advance/feed grants → cash JE;
 * lock → Dr Milk Purchases / Cr Payable + recoveries (cycle.journalEntryId);
 * pay → Dr Farmer Payable / Cr Bank.
 */
export class PayoutService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  // ── farmer ledger ────────────────────────────────────────────────────

  async addLedgerEntry(
    input: CreateLedgerEntryInput, userId?: string, principal?: MpPrincipal,
  ): Promise<LedgerRow> {
    if (principal?.kind === 'operator') {
      await assertFarmerAtNode(this.db, this.tenantId, principal, input.farmerId);
    }
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
      // Cash leaving for a new advance/feed-loan creates the farmer receivable.
      if (input.entryType === 'advance_given' || input.entryType === 'feed_loan_given') {
        await new MpGlPoster(this.tenantId, userId).postGrant(tx, {
          ledgerId: row!.id, date: input.occurredOn, amount: input.amount,
          kind: input.entryType === 'feed_loan_given' ? 'feed_loan' : 'advance',
        });
      }
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
    if (principal.kind === 'operator') {
      await assertFarmerAtNode(this.db, this.tenantId, principal, effectiveFarmerId);
    }
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
    principal?: MpPrincipal,
  ): Promise<{ data: CycleListRow[]; meta: PaginationMeta }> {
    const { page, limit } = pagination;
    const { offset } = applyPagination(page, limit);
    const conds = [eq(mpPayoutCycles.tenantId, this.tenantId)];
    if (filters.status) conds.push(eq(mpPayoutCycles.status, filters.status));
    if (filters.scopeNodeId) conds.push(eq(mpPayoutCycles.scopeNodeId, filters.scopeNodeId));
    if (principal?.kind === 'operator') {
      conds.push(principal.nodeIds.size
        ? inArray(mpPayoutCycles.scopeNodeId, [...principal.nodeIds]) : sql`false`);
    }
    const where = and(...conds);
    const [rows, countResult] = await Promise.all([
      this.db.select().from(mpPayoutCycles).where(where)
        .orderBy(desc(mpPayoutCycles.periodStart)).limit(limit).offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(mpPayoutCycles).where(where),
    ]);
    const total = countResult[0]?.count ?? 0;
    const aggByCycle = await this.lineAggregates(rows.map((r) => r.id));
    const data = rows.map((r) => ({
      ...r,
      ...(aggByCycle.get(r.id) ?? { lineCount: 0, paidCount: 0, netTotal: 0, paidTotal: 0 }),
    }));
    return { data, meta: { page, limit, total, totalPages: calcTotalPages(total, limit) } };
  }

  /** Per-cycle line roll-ups: how many farmers, how many marked paid, ₹ net & ₹ paid. */
  private async lineAggregates(cycleIds: string[]): Promise<Map<string, CycleLineAgg>> {
    const map = new Map<string, CycleLineAgg>();
    if (!cycleIds.length) return map;
    const rows = await this.db.select({
      cycleId: mpPayoutLines.payoutCycleId,
      lineCount: sql<number>`count(*)::int`,
      paidCount: sql<number>`(count(*) filter (where ${mpPayoutLines.paidAt} is not null))::int`,
      netTotal: sql<string>`coalesce(sum(${mpPayoutLines.netAmount}), 0)`,
      paidTotal: sql<string>`coalesce(sum(${mpPayoutLines.netAmount}) filter (where ${mpPayoutLines.paidAt} is not null), 0)`,
    }).from(mpPayoutLines)
      .where(and(eq(mpPayoutLines.tenantId, this.tenantId), inArray(mpPayoutLines.payoutCycleId, cycleIds)))
      .groupBy(mpPayoutLines.payoutCycleId);
    for (const r of rows) {
      map.set(r.cycleId, {
        lineCount: r.lineCount, paidCount: r.paidCount,
        netTotal: Number(r.netTotal), paidTotal: Number(r.paidTotal),
      });
    }
    return map;
  }

  async createCycle(input: CreatePayoutCycleInput, principal?: MpPrincipal): Promise<CycleDetail> {
    if (principal?.kind === 'operator') {
      if (!input.scopeNodeId) throw new ForbiddenError('Operators must scope a cycle to their node');
      assertNodeAccess(principal, input.scopeNodeId);
      await this.assertNoOverlap(input.scopeNodeId, input.periodStart, input.periodEnd);
    }
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

  /**
   * Generate the cycle for the most recently closed period if the tenant has
   * auto-roll configured and one doesn't exist yet. Idempotent (safe to re-run)
   * and tolerant of empty periods — used by the daily cycle-roll scheduler.
   */
  async autoGenerateDueCycle(today: string): Promise<{ generated: boolean; cycleNo?: string; reason?: string }> {
    const [s] = await this.db.select().from(mpGlSettings).where(eq(mpGlSettings.tenantId, this.tenantId));
    if (!s?.autoGenerateCycle || s.cycleDays == null || !s.cycleAnchorDate) {
      return { generated: false, reason: 'auto-generate not configured' };
    }
    const period = computeDuePeriod(s.cycleDays, today);
    if (!period) return { generated: false, reason: 'no closed period yet' };
    // Anchor gates the start: don't auto-bill cycles that closed before go-live.
    if (period.start < s.cycleAnchorDate) return { generated: false, reason: 'before cycle anchor' };
    const [existing] = await this.db.select({ id: mpPayoutCycles.id }).from(mpPayoutCycles).where(and(
      eq(mpPayoutCycles.tenantId, this.tenantId), isNull(mpPayoutCycles.scopeNodeId),
      eq(mpPayoutCycles.periodStart, period.start),
    ));
    if (existing) return { generated: false, reason: 'already generated' };
    try {
      const cycle = await this.createCycle({ scopeNodeId: null, periodStart: period.start, periodEnd: period.end });
      return { generated: true, cycleNo: cycle.cycleNo };
    } catch (err) {
      if (err instanceof ConflictError) return { generated: false, reason: 'no recorded collections' };
      throw err;
    }
  }

  async getCycle(id: string, principal?: MpPrincipal): Promise<CycleDetail> {
    const [cycle] = await this.db.select().from(mpPayoutCycles)
      .where(and(eq(mpPayoutCycles.tenantId, this.tenantId), eq(mpPayoutCycles.id, id)));
    if (!cycle) throw new NotFoundError('Payout cycle not found');
    if (principal?.kind === 'operator') assertNodeAccess(principal, cycle.scopeNodeId ?? '');
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

  async lockCycle(id: string, principal?: MpPrincipal): Promise<MpPayoutCycleRow> {
    const cycle = await this.requireStatus(id, 'open');
    if (principal?.kind === 'operator') assertNodeAccess(principal, cycle.scopeNodeId ?? '');
    const lines = await this.db.select().from(mpPayoutLines)
      .where(and(eq(mpPayoutLines.tenantId, this.tenantId), eq(mpPayoutLines.payoutCycleId, id)));
    const totals = lines.reduce((a, l) => ({
      qty: a.qty + Number(l.qtyLitres), gross: a.gross + Number(l.grossAmount),
      ded: a.ded + Number(l.deductionTotal), net: a.net + Number(l.netAmount),
    }), { qty: 0, gross: 0, ded: 0, net: 0 });
    return this.db.transaction(async (tx) => {
      const recovered = await this.postRepayments(tx, cycle, lines);
      // Accrue the milk cost: Dr Milk Purchases / Cr Payable + Cr recovered advances/loans.
      const journalEntryId = await new MpGlPoster(this.tenantId).postAccrual(tx, {
        cycleId: cycle.id, cycleNo: cycle.cycleNo, date: cycle.periodEnd,
        net: totals.net, advance: recovered.advance, feedLoan: recovered.feedLoan,
      });
      const [updated] = await tx.update(mpPayoutCycles).set({
        status: 'locked', lockedAt: new Date(), journalEntryId,
        totalQty: String(round3(totals.qty)), totalGross: String(round2(totals.gross)),
        totalDeductions: String(round2(totals.ded)), totalNet: String(round2(totals.net)),
        updatedAt: new Date(),
      }).where(and(eq(mpPayoutCycles.tenantId, this.tenantId), eq(mpPayoutCycles.id, id))).returning();
      return updated!;
    });
  }

  async payCycle(id: string, principal?: MpPrincipal, userId?: string): Promise<MpPayoutCycleRow> {
    const cycle = await this.requireStatus(id, 'locked');
    if (principal?.kind === 'operator') assertNodeAccess(principal, cycle.scopeNodeId ?? '');
    // VMCCs on via_vmcc are settled through per-VMCC bills. Block the bulk pay
    // while any bill is still open, else those farmers would be paid twice.
    const [openBill] = await this.db.select({ billNo: mpVmccBills.billNo }).from(mpVmccBills).where(and(
      eq(mpVmccBills.tenantId, this.tenantId), eq(mpVmccBills.payoutCycleId, id), eq(mpVmccBills.status, 'generated'),
    )).limit(1);
    if (openBill) throw new ConflictError(`Settle VMCC bill ${openBill.billNo} before paying this cycle`);
    // Lines already settled via a bill are excluded — pay only the direct remainder.
    const lines = await this.db.select({
      lineId: mpPayoutLines.id, farmerId: mpPayoutLines.farmerId,
      vendorId: mpFarmers.vendorId, netAmount: mpPayoutLines.netAmount,
    }).from(mpPayoutLines).innerJoin(mpFarmers, eq(mpFarmers.id, mpPayoutLines.farmerId))
      .where(and(
        eq(mpPayoutLines.tenantId, this.tenantId), eq(mpPayoutLines.payoutCycleId, id),
        isNull(mpPayoutLines.billId), isNull(mpPayoutLines.paymentId),
      ));
    const mode = await this.resolvePayoutMode(cycle.scopeNodeId);
    const paidTotal = lines.reduce((s, l) => s + Math.max(0, Number(l.netAmount)), 0);
    return this.db.transaction(async (tx) => {
      if (mode === 'via_vmcc') await this.payViaVmcc(tx, cycle, lines);
      else await this.payDirect(tx, cycle, lines);
      // Cash out settles the payable accrued at lock: Dr Farmer Payable / Cr Bank.
      await new MpGlPoster(this.tenantId, userId).postPayment(tx, {
        cycleId: cycle.id, cycleNo: cycle.cycleNo, date: cycle.periodEnd, amount: paidTotal,
      });
      // Paying the cycle disburses everyone — mark any still-unticked line paid so
      // the per-farmer checklist matches reality.
      await tx.update(mpPayoutLines).set({ paidAt: new Date(), paidBy: userId ?? null })
        .where(and(
          eq(mpPayoutLines.tenantId, this.tenantId), eq(mpPayoutLines.payoutCycleId, id),
          isNull(mpPayoutLines.paidAt),
        ));
      const [updated] = await tx.update(mpPayoutCycles)
        .set({ status: 'paid', paidAt: new Date(), updatedAt: new Date() })
        .where(and(eq(mpPayoutCycles.tenantId, this.tenantId), eq(mpPayoutCycles.id, id))).returning();
      return updated!;
    });
  }

  /**
   * Rebuild a cycle's farmer lines from the CURRENT pours after milk data is
   * corrected — leaving already-PAID farmers frozen. Recomputes only unpaid lines
   * (paidAt/paymentId/billId null) and, if the cycle is locked, posts a signed GL
   * adjustment for the net change (Δ Milk Purchases / Payable / recoveries). An
   * open cycle just recomputes lines (accrual not yet posted). Returns true if it
   * changed anything. Reuses the farmer-primary aggregation, so it works for both
   * VMCC bills and direct farmer bills.
   */
  async rebuildCycleLines(cycleId: string, userId?: string): Promise<boolean> {
    const cycle = await this.requireCycle(cycleId);
    if (cycle.status === 'reversed' || cycle.status === 'paid') return false;
    const aggregates = await this.pourAggregates(cycle.periodStart, cycle.periodEnd, cycle.scopeNodeId ?? null);

    if (cycle.status === 'open') {
      // No accrual/repayments yet — recompute every line from current pours.
      await this.db.transaction(async (tx) => {
        const old = await tx.select({ id: mpPayoutLines.id }).from(mpPayoutLines)
          .where(and(eq(mpPayoutLines.tenantId, this.tenantId), eq(mpPayoutLines.payoutCycleId, cycleId)));
        const ids = old.map((l) => l.id);
        if (ids.length) await tx.delete(mpPayoutDeductions).where(inArray(mpPayoutDeductions.payoutLineId, ids));
        await tx.delete(mpPayoutLines).where(and(eq(mpPayoutLines.tenantId, this.tenantId), eq(mpPayoutLines.payoutCycleId, cycleId)));
        for (const a of aggregates) await this.insertLine(tx, cycleId, cycle.periodStart, a);
        await this.updateCycleTotals(tx, cycleId);
      });
      return true;
    }

    // Locked: recompute only unpaid lines; freeze paid ones; post a delta accrual.
    const lines = await this.db.select({
      id: mpPayoutLines.id, farmerId: mpPayoutLines.farmerId,
      gross: mpPayoutLines.grossAmount, net: mpPayoutLines.netAmount,
      paidAt: mpPayoutLines.paidAt, paymentId: mpPayoutLines.paymentId, billId: mpPayoutLines.billId,
    }).from(mpPayoutLines).where(and(eq(mpPayoutLines.tenantId, this.tenantId), eq(mpPayoutLines.payoutCycleId, cycleId)));
    const unpaid = lines.filter((l) => !l.paidAt && !l.paymentId && !l.billId);
    const paidFarmers = new Set(lines.filter((l) => l.paidAt || l.paymentId || l.billId).map((l) => l.farmerId));
    const unpaidIds = unpaid.map((l) => l.id);
    const oldRecovered = await this.recoveredByType(this.db, unpaidIds);
    const oldNet = unpaid.reduce((s, l) => s + Number(l.net), 0);

    await this.db.transaction(async (tx) => {
      if (unpaidIds.length) {
        await tx.delete(mpFarmerLedger).where(and(
          eq(mpFarmerLedger.tenantId, this.tenantId), eq(mpFarmerLedger.entryType, 'repayment'), inArray(mpFarmerLedger.refId, unpaidIds),
        ));
        await tx.delete(mpPayoutDeductions).where(inArray(mpPayoutDeductions.payoutLineId, unpaidIds));
        await tx.delete(mpPayoutLines).where(inArray(mpPayoutLines.id, unpaidIds));
      }
      const fresh: MpPayoutLineRow[] = [];
      for (const a of aggregates) {
        if (paidFarmers.has(a.farmerId)) continue; // frozen — keep the paid line as-is
        fresh.push(await this.insertLine(tx, cycleId, cycle.periodStart, a));
      }
      const recovered = await this.postRepayments(tx, cycle, fresh);
      const newNet = fresh.reduce((s, l) => s + Number(l.netAmount), 0);
      const dNet = round2(newNet - oldNet);
      const dAdvance = round2(recovered.advance - oldRecovered.advance);
      const dFeed = round2(recovered.feedLoan - oldRecovered.feedLoan);
      await new MpGlPoster(this.tenantId, userId).postAccrualDelta(tx, {
        cycleId: cycle.id, cycleNo: cycle.cycleNo, date: cycle.periodEnd,
        gross: round2(dNet + dAdvance + dFeed), net: dNet, advance: dAdvance, feedLoan: dFeed,
      });
      await this.updateCycleTotals(tx, cycleId);
    });
    return unpaid.length > 0 || aggregates.some((a) => !paidFarmers.has(a.farmerId));
  }

  /** Insert one recomputed payout line (+ its deductions) from a pour aggregate. */
  private async insertLine(
    tx: Tx, cycleId: string, periodStart: string, a: { farmerId: string; qty: number; gross: number; bonus: number },
  ): Promise<MpPayoutLineRow> {
    const ded = await this.computeDeductionsTx(tx, a.farmerId, a.gross);
    const statementNo = await nextDocNo(tx, this.tenantId, 'statement', periodStart, 'STM');
    const [line] = await tx.insert(mpPayoutLines).values({
      tenantId: this.tenantId, payoutCycleId: cycleId, farmerId: a.farmerId,
      qtyLitres: String(a.qty), grossAmount: String(a.gross), bonusAmount: String(a.bonus),
      deductionTotal: String(ded.total), netAmount: String(round2(a.gross - ded.total)), statementNo,
    }).returning();
    await this.insertDeductions(tx, line!.id, ded);
    return line!;
  }

  /** Sum recovered advance / feed-loan across a set of payout lines' deductions. */
  private async recoveredByType(db: Db | Tx, lineIds: string[]): Promise<{ advance: number; feedLoan: number }> {
    if (!lineIds.length) return { advance: 0, feedLoan: 0 };
    const rows = await (db as Db).select({
      type: mpPayoutDeductions.deductionType, amt: sql<string>`coalesce(sum(${mpPayoutDeductions.amount}), 0)`,
    }).from(mpPayoutDeductions).where(inArray(mpPayoutDeductions.payoutLineId, lineIds)).groupBy(mpPayoutDeductions.deductionType);
    let advance = 0, feedLoan = 0;
    for (const r of rows) { if (r.type === 'cattle_feed_loan') feedLoan = Number(r.amt); else if (r.type === 'advance') advance = Number(r.amt); }
    return { advance, feedLoan };
  }

  /** Recompute a cycle's header totals from its current lines. */
  private async updateCycleTotals(tx: Tx, cycleId: string): Promise<void> {
    const [t] = await tx.select({
      qty: sql<string>`coalesce(sum(${mpPayoutLines.qtyLitres}), 0)`,
      gross: sql<string>`coalesce(sum(${mpPayoutLines.grossAmount}), 0)`,
      ded: sql<string>`coalesce(sum(${mpPayoutLines.deductionTotal}), 0)`,
      net: sql<string>`coalesce(sum(${mpPayoutLines.netAmount}), 0)`,
    }).from(mpPayoutLines).where(and(eq(mpPayoutLines.tenantId, this.tenantId), eq(mpPayoutLines.payoutCycleId, cycleId)));
    await tx.update(mpPayoutCycles).set({
      totalQty: String(round3(Number(t?.qty ?? 0))), totalGross: String(round2(Number(t?.gross ?? 0))),
      totalDeductions: String(round2(Number(t?.ded ?? 0))), totalNet: String(round2(Number(t?.net ?? 0))), updatedAt: new Date(),
    }).where(and(eq(mpPayoutCycles.tenantId, this.tenantId), eq(mpPayoutCycles.id, cycleId)));
  }

  /** Mark one farmer line paid/unpaid (operational disbursement flag). */
  async markLinePaid(
    cycleId: string, lineId: string, paid: boolean, userId?: string, principal?: MpPrincipal,
  ): Promise<MpPayoutLineRow> {
    const cycle = await this.requireCycle(cycleId);
    if (cycle.status === 'reversed') throw new ConflictError('Cannot change a reversed cycle');
    if (principal?.kind === 'operator') assertNodeAccess(principal, cycle.scopeNodeId ?? '');
    const [updated] = await this.db.update(mpPayoutLines)
      .set({ paidAt: paid ? new Date() : null, paidBy: paid ? userId ?? null : null })
      .where(and(
        eq(mpPayoutLines.tenantId, this.tenantId),
        eq(mpPayoutLines.id, lineId),
        eq(mpPayoutLines.payoutCycleId, cycleId),
      )).returning();
    if (!updated) throw new NotFoundError('Payout line not found');
    return updated;
  }

  /** Mark every line in a cycle paid/unpaid in one go. */
  async markAllLinesPaid(
    cycleId: string, paid: boolean, userId?: string, principal?: MpPrincipal,
  ): Promise<{ updated: number }> {
    const cycle = await this.requireCycle(cycleId);
    if (cycle.status === 'reversed') throw new ConflictError('Cannot change a reversed cycle');
    if (principal?.kind === 'operator') assertNodeAccess(principal, cycle.scopeNodeId ?? '');
    const rows = await this.db.update(mpPayoutLines)
      .set({ paidAt: paid ? new Date() : null, paidBy: paid ? userId ?? null : null })
      .where(and(eq(mpPayoutLines.tenantId, this.tenantId), eq(mpPayoutLines.payoutCycleId, cycleId)))
      .returning({ id: mpPayoutLines.id });
    return { updated: rows.length };
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

  /** Tx-aware deduction compute — used by rebuild, after old repayments are dropped in the same tx. */
  private async computeDeductionsTx(tx: Tx, farmerId: string, gross: number) {
    const rows = await tx.select({
      entryType: mpFarmerLedger.entryType, refType: mpFarmerLedger.refType, amount: mpFarmerLedger.amount,
    }).from(mpFarmerLedger).where(and(eq(mpFarmerLedger.tenantId, this.tenantId), eq(mpFarmerLedger.farmerId, farmerId)));
    let advanceOut = 0, feedOut = 0;
    for (const r of rows) {
      const amt = Number(r.amount);
      if (r.entryType === 'advance_given') advanceOut += amt;
      else if (r.entryType === 'feed_loan_given') feedOut += amt;
      else if (r.entryType === 'repayment') { if (r.refType === 'cattle_feed_loan') feedOut -= amt; else advanceOut -= amt; }
    }
    let remaining = gross;
    const advance = Math.min(Math.max(0, round2(advanceOut)), remaining); remaining -= advance;
    const feedLoan = Math.min(Math.max(0, round2(feedOut)), remaining);
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

  /** Post the repayment ledger entries and return total ₹ recovered by type
   *  (drives the credit legs of the lock accrual JE). */
  private async postRepayments(
    tx: Tx, cycle: MpPayoutCycleRow, lines: MpPayoutLineRow[],
  ): Promise<{ advance: number; feedLoan: number }> {
    const recovered = { advance: 0, feedLoan: 0 };
    const lineIds = lines.map((l) => l.id);
    if (!lineIds.length) return recovered;
    const deds = await tx.select().from(mpPayoutDeductions).where(inArray(mpPayoutDeductions.payoutLineId, lineIds));
    const farmerByLine = new Map(lines.map((l) => [l.id, l.farmerId]));
    for (const d of deds) {
      const farmerId = farmerByLine.get(d.payoutLineId)!;
      const prev = await this.balanceTx(tx, farmerId);
      const isFeed = d.deductionType === 'cattle_feed_loan';
      if (isFeed) recovered.feedLoan += Number(d.amount); else recovered.advance += Number(d.amount);
      await tx.insert(mpFarmerLedger).values({
        tenantId: this.tenantId, farmerId, entryType: 'repayment', amount: d.amount,
        balanceAfter: String(round2(prev - Number(d.amount))),
        refType: isFeed ? 'cattle_feed_loan' : 'advance',
        refId: d.payoutLineId, occurredOn: cycle.periodEnd,
      });
    }
    return recovered;
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

  /**
   * Reject a node-scoped cycle whose period overlaps an existing live cycle for
   * the same node OR a tenant-wide cycle — both would aggregate the same pours
   * and double-pay the farmer. Reversed cycles are ignored.
   */
  private async assertNoOverlap(scopeNodeId: string, start: string, end: string): Promise<void> {
    const [existing] = await this.db.select({ cycleNo: mpPayoutCycles.cycleNo }).from(mpPayoutCycles)
      .where(and(
        eq(mpPayoutCycles.tenantId, this.tenantId),
        ne(mpPayoutCycles.status, 'reversed'),
        or(eq(mpPayoutCycles.scopeNodeId, scopeNodeId), isNull(mpPayoutCycles.scopeNodeId)),
        lte(mpPayoutCycles.periodStart, end),
        gte(mpPayoutCycles.periodEnd, start),
      )).limit(1);
    if (existing) {
      throw new ConflictError(`Cycle ${existing.cycleNo} already covers this node and period`);
    }
  }

  private async requireStatus(id: string, status: MpPayoutCycleRow['status']): Promise<MpPayoutCycleRow> {
    const cycle = await this.requireCycle(id);
    if (cycle.status !== status) throw new ConflictError(`Cycle is ${cycle.status}, expected ${status}`);
    return cycle;
  }

  private async requireCycle(id: string): Promise<MpPayoutCycleRow> {
    const [cycle] = await this.db.select().from(mpPayoutCycles)
      .where(and(eq(mpPayoutCycles.tenantId, this.tenantId), eq(mpPayoutCycles.id, id)));
    if (!cycle) throw new NotFoundError('Payout cycle not found');
    return cycle;
  }
}

/**
 * Calendar-aligned cycle windows within one month: 15-day → [1-15],[16-end];
 * 10-day → [1-10],[11-20],[21-end]. The final window absorbs the remainder so
 * cycles never cross months. `month` is 1-based. Returned ascending.
 */
function monthCycles(year: number, month: number, n: number): { start: string; end: string }[] {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const threshold = Math.min(30, daysInMonth); // merge a 31st-day stub
  const starts: number[] = [];
  for (let s = 1; s <= threshold; s += n) starts.push(s);
  const iso = (d: number) =>
    `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return starts.map((s, i) => ({ start: iso(s), end: iso(i < starts.length - 1 ? starts[i + 1]! - 1 : daysInMonth) }));
}

/**
 * The most recently *closed* calendar-aligned cycle (end strictly before
 * `today`), or null if none has closed yet. Scans the current + previous month.
 */
export function computeDuePeriod(cycleDays: number, today: string): { start: string; end: string } | null {
  if (cycleDays < 1) return null;
  const [ty, tm] = today.split('-').map(Number);
  if (!ty || !tm) return null;
  let y = ty, m = tm;
  const candidates: { start: string; end: string }[] = [];
  for (let back = 0; back < 2; back++) {
    candidates.push(...monthCycles(y, m, cycleDays));
    m -= 1; if (m === 0) { m = 12; y -= 1; }
  }
  const closed = candidates.filter((c) => c.end < today).sort((a, b) => (a.end < b.end ? 1 : -1));
  return closed[0] ?? null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
