import { and, eq, desc, ne, or, sql, gte, lte, inArray, isNull, getTableColumns } from 'drizzle-orm';
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
import { computeDuePeriod } from './cycle-window';
import { MpGlPoster } from './gl-poster';
import { MpPrincipal, assertNodeAccess, assertFarmerAtNode } from './access-scope';
import {
  BUCKET_BY_DEDUCTION, DEDUCTION_TYPES, appendLedgerEntry, foldOutstanding,
  ledgerBalance, waterfall, zeroOutstanding, type Outstanding,
} from './farmer-ledger';
import { sendFarmerBillNotifications, directModeVmccIds } from './mp-bill-notify';
import { sendCyclePaymentNotifications } from './mp-payment-notify';

type LedgerRow = typeof mpFarmerLedger.$inferSelect;
type DeductionRow = typeof mpPayoutDeductions.$inferSelect;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface CycleDetail extends MpPayoutCycleRow {
  lines: (MpPayoutLineRow & {
    deductions: DeductionRow[];
    farmerName: string; farmerCode: string;
    vmccNodeId: string | null; vmccName: string | null;
    /** true = farmer is settled through a VMCC bill, not payable individually here. */
    viaVmcc: boolean;
  })[];
  /** VMCC-bill roll-up so a pooled (via_vmcc) cycle, which has no farmer lines,
   *  still shows a meaningful payable/paid on the detail cards. */
  billTotal: number;
  billPaidTotal: number;
}

/** Per-cycle line roll-up returned with each row in the cycle list. */
export interface CycleLineAgg {
  lineCount: number;
  paidCount: number;
  netTotal: number;
  paidTotal: number;
}

/** Per-cycle VMCC-bill roll-up (pooled centres settle via these, not farmer lines). */
export interface CycleBillAgg {
  billCount: number;
  billPaidCount: number;
  billTotal: number;
  billPaidTotal: number;
}

export type CycleListRow = MpPayoutCycleRow & CycleLineAgg & CycleBillAgg;

/** A farmer's payout line flattened with its cycle's window and status. */
export type FarmerLineRow = MpPayoutLineRow & {
  periodStart: string;
  periodEnd: string;
  cycleStatus: MpPayoutCycleRow['status'];
  cycleNo: string;
};

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
      const row = await appendLedgerEntry(tx, this.tenantId, { ...input, createdBy: userId });
      // Cash leaving for a new advance/feed-loan creates the farmer receivable.
      if (input.entryType === 'advance_given' || input.entryType === 'feed_loan_given') {
        await new MpGlPoster(this.tenantId, userId).postGrant(tx, {
          ledgerId: row.id, date: input.occurredOn, amount: input.amount,
          kind: input.entryType === 'feed_loan_given' ? 'feed_loan' : 'advance',
        });
      }
      return row;
    });
  }

  async ledgerForFarmer(
    farmerId: string | undefined,
    principal: MpPrincipal,
  ): Promise<{ balance: number; outstanding: Outstanding; entries: LedgerRow[] }> {
    // a farmer can only read their own ledger, whatever they ask for
    const effectiveFarmerId = principal.kind === 'farmer' ? principal.farmerId : farmerId;
    if (!effectiveFarmerId) throw new NotFoundError('farmerId is required');
    if (principal.kind === 'operator') {
      await assertFarmerAtNode(this.db, this.tenantId, principal, effectiveFarmerId);
    }
    const entries = await this.db.select().from(mpFarmerLedger)
      .where(and(eq(mpFarmerLedger.tenantId, this.tenantId), eq(mpFarmerLedger.farmerId, effectiveFarmerId)))
      .orderBy(desc(mpFarmerLedger.occurredOn), desc(mpFarmerLedger.createdAt));
    // The blended balance answers "how much is owed"; the split answers "against
    // what" — the same breakdown the next cycle's deductions will recover, so it
    // reads from the one rule rather than a second derivation on the client.
    const outstanding = await this.outstandingByType(effectiveFarmerId);
    return { balance: ledgerBalance(entries), outstanding, entries };
  }

  /** A farmer's own payout lines (with cycle window + status), newest first. */
  async linesForFarmer(
    farmerId: string | undefined,
    principal: MpPrincipal,
    limit: number,
  ): Promise<FarmerLineRow[]> {
    // a farmer can only read their own lines, whatever they ask for
    const effectiveFarmerId = principal.kind === 'farmer' ? principal.farmerId : farmerId;
    if (!effectiveFarmerId) throw new NotFoundError('farmerId is required');
    if (principal.kind === 'operator') {
      await assertFarmerAtNode(this.db, this.tenantId, principal, effectiveFarmerId);
    }
    const rows = await this.db.select({
      line: mpPayoutLines,
      periodStart: mpPayoutCycles.periodStart,
      periodEnd: mpPayoutCycles.periodEnd,
      cycleStatus: mpPayoutCycles.status,
      cycleNo: mpPayoutCycles.cycleNo,
    }).from(mpPayoutLines)
      .innerJoin(mpPayoutCycles, eq(mpPayoutLines.payoutCycleId, mpPayoutCycles.id))
      .where(and(
        eq(mpPayoutLines.tenantId, this.tenantId),
        eq(mpPayoutLines.farmerId, effectiveFarmerId),
        ne(mpPayoutCycles.status, 'reversed'),
      ))
      .orderBy(desc(mpPayoutCycles.periodStart))
      .limit(limit);
    return rows.map((r) => ({
      ...r.line,
      periodStart: r.periodStart,
      periodEnd: r.periodEnd,
      cycleStatus: r.cycleStatus,
      cycleNo: r.cycleNo,
    }));
  }

  private async balanceTx(tx: Tx, farmerId: string): Promise<number> {
    const [last] = await tx.select({ b: mpFarmerLedger.balanceAfter }).from(mpFarmerLedger)
      .where(and(eq(mpFarmerLedger.tenantId, this.tenantId), eq(mpFarmerLedger.farmerId, farmerId)))
      .orderBy(desc(mpFarmerLedger.createdAt)).limit(1);
    return last ? Number(last.b) : 0;
  }

  private async outstandingByType(farmerId: string): Promise<Outstanding> {
    return foldOutstanding(await this.ledgerRows(this.db, farmerId));
  }

  private ledgerRows(db: Db | Tx, farmerId: string) {
    return (db as Db).select({
      entryType: mpFarmerLedger.entryType, refType: mpFarmerLedger.refType, amount: mpFarmerLedger.amount,
    }).from(mpFarmerLedger)
      .where(and(eq(mpFarmerLedger.tenantId, this.tenantId), eq(mpFarmerLedger.farmerId, farmerId)));
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
    const ids = rows.map((r) => r.id);
    const [aggByCycle, billByCycle] = await Promise.all([this.lineAggregates(ids), this.billAggregates(ids)]);
    const data = rows.map((r) => ({
      ...r,
      ...(aggByCycle.get(r.id) ?? { lineCount: 0, paidCount: 0, netTotal: 0, paidTotal: 0 }),
      ...(billByCycle.get(r.id) ?? { billCount: 0, billPaidCount: 0, billTotal: 0, billPaidTotal: 0 }),
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

  /** Per-cycle VMCC-bill roll-ups: bill count, paid count, ₹ billed & ₹ paid. */
  private async billAggregates(cycleIds: string[]): Promise<Map<string, CycleBillAgg>> {
    const map = new Map<string, CycleBillAgg>();
    if (!cycleIds.length) return map;
    const rows = await this.db.select({
      cycleId: mpVmccBills.payoutCycleId,
      billCount: sql<number>`count(*)::int`,
      billPaidCount: sql<number>`(count(*) filter (where ${mpVmccBills.status} = 'paid'))::int`,
      billTotal: sql<string>`coalesce(sum(${mpVmccBills.totalAmount}), 0)`,
      billPaidTotal: sql<string>`coalesce(sum(${mpVmccBills.totalAmount}) filter (where ${mpVmccBills.status} = 'paid'), 0)`,
    }).from(mpVmccBills)
      .where(and(
        eq(mpVmccBills.tenantId, this.tenantId), inArray(mpVmccBills.payoutCycleId, cycleIds),
        ne(mpVmccBills.status, 'reversed'),
      )).groupBy(mpVmccBills.payoutCycleId);
    for (const r of rows) {
      map.set(r.cycleId, {
        billCount: r.billCount, billPaidCount: r.billPaidCount,
        billTotal: Number(r.billTotal), billPaidTotal: Number(r.billPaidTotal),
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
    const scopeNodeId = input.scopeNodeId ?? null;
    const aggregates = await this.pourAggregates(input.periodStart, input.periodEnd, scopeNodeId);
    // A CC cycle may legitimately have zero farmer lines — a CC whose VMCCs all
    // pool (via_vmcc) records no per-farmer pours, only bulk receipts billed as
    // VMCC bills. Still create the cycle so those bills have a home.
    const scopeIsCc = scopeNodeId ? await this.isCcNode(scopeNodeId) : false;
    if (!aggregates.length && !scopeIsCc) throw new ConflictError('No recorded collections in this period/scope');
    // Guard every caller (not just operators) against a duplicate cycle for the
    // same scope+period. Backed by the DB index uq_mp_cycle_scope_period against
    // concurrent races (see the 23505 catch below).
    if (scopeNodeId) await this.assertNoScopeOverlap(scopeNodeId, input.periodStart, input.periodEnd);
    let cycleId: string;
    try {
      cycleId = await this.db.transaction(async (tx) => {
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
        // Roll the header totals up from the lines so an open cycle shows its
        // provisional Gross/Deductions/Net immediately (not just after lock).
        await this.updateCycleTotals(tx, cycle!.id);
        return cycle!.id;
      });
    } catch (e) {
      // Lost the create race against a concurrent request — the DB unique index
      // uq_mp_cycle_scope_period rejects the second insert. Surface it as the
      // same 409 the pre-check raises rather than a raw 500.
      const code = (e as { code?: string })?.code ?? (e as { cause?: { code?: string } })?.cause?.code;
      if (code === '23505') throw new ConflictError('A cycle already covers this centre and period');
      throw e;
    }
    return this.getCycle(cycleId);
  }

  /**
   * Generate the cycle for the most recently closed period if the tenant has
   * auto-roll configured and one doesn't exist yet. Idempotent (safe to re-run)
   * and tolerant of empty periods — used by the daily cycle-roll scheduler.
   */
  async autoGenerateDueCycle(today: string): Promise<{ generated: boolean; count?: number; reason?: string }> {
    const [s] = await this.db.select().from(mpGlSettings).where(eq(mpGlSettings.tenantId, this.tenantId));
    if (!s?.autoGenerateCycle || s.cycleDays == null || !s.cycleAnchorDate) {
      return { generated: false, reason: 'auto-generate not configured' };
    }
    const period = computeDuePeriod(s.cycleDays, today);
    if (!period) return { generated: false, reason: 'no closed period yet' };
    // Anchor gates the start: don't auto-bill cycles that closed before go-live.
    if (period.start < s.cycleAnchorDate) return { generated: false, reason: 'before cycle anchor' };
    // One cycle per active CC (cycles are CC-scoped). CCs whose VMCCs all pool
    // (no per-farmer pours) are billed on demand — their cycle is created when
    // the operator opens billing — so auto-roll only pre-creates CCs that have
    // farmer collections to finalize on schedule.
    const ccs = await this.db.select({ id: mpNodes.id }).from(mpNodes).where(and(
      eq(mpNodes.tenantId, this.tenantId), eq(mpNodes.nodeType, 'cc'), eq(mpNodes.isActive, true),
    ));
    let count = 0;
    for (const cc of ccs) {
      const [existing] = await this.db.select({ id: mpPayoutCycles.id }).from(mpPayoutCycles).where(and(
        eq(mpPayoutCycles.tenantId, this.tenantId), eq(mpPayoutCycles.scopeNodeId, cc.id),
        eq(mpPayoutCycles.periodStart, period.start),
      ));
      if (existing) continue;
      const agg = await this.pourAggregates(period.start, period.end, cc.id);
      if (!agg.length) continue; // no farmer collections — created on demand instead
      await this.createCycle({ scopeNodeId: cc.id, periodStart: period.start, periodEnd: period.end });
      count++;
    }
    return { generated: count > 0, count, ...(count ? {} : { reason: 'no CC with recorded collections' }) };
  }

  async getCycle(id: string, principal?: MpPrincipal): Promise<CycleDetail> {
    const [cycle] = await this.db.select().from(mpPayoutCycles)
      .where(and(eq(mpPayoutCycles.tenantId, this.tenantId), eq(mpPayoutCycles.id, id)));
    if (!cycle) throw new NotFoundError('Payout cycle not found');
    if (principal?.kind === 'operator') assertNodeAccess(principal, cycle.scopeNodeId ?? '');
    // Enrich each line with who it's for (farmer) and which VMCC they supply, so
    // the cycle page can list them without a second round of lookups.
    const lines = await this.db.select({
      ...getTableColumns(mpPayoutLines),
      farmerName: mpFarmers.name, farmerCode: mpFarmers.code,
      vmccNodeId: mpFarmerMemberships.nodeId, vmccName: mpNodes.name,
    }).from(mpPayoutLines)
      .innerJoin(mpFarmers, eq(mpFarmers.id, mpPayoutLines.farmerId))
      .leftJoin(mpFarmerMemberships, and(
        eq(mpFarmerMemberships.farmerId, mpPayoutLines.farmerId), eq(mpFarmerMemberships.tenantId, this.tenantId),
        eq(mpFarmerMemberships.isPrimary, true), isNull(mpFarmerMemberships.leftOn),
      ))
      .leftJoin(mpNodes, eq(mpNodes.id, mpFarmerMemberships.nodeId))
      .where(and(eq(mpPayoutLines.tenantId, this.tenantId), eq(mpPayoutLines.payoutCycleId, id)));
    const lineIds = lines.map((l) => l.id);
    const deds = lineIds.length
      ? await this.db.select().from(mpPayoutDeductions).where(inArray(mpPayoutDeductions.payoutLineId, lineIds))
      : [];
    const byLine = new Map<string, DeductionRow[]>();
    for (const d of deds) byLine.set(d.payoutLineId, [...(byLine.get(d.payoutLineId) ?? []), d]);
    const directIds = await directModeVmccIds(this.db, this.tenantId);
    const bill = (await this.billAggregates([id])).get(id);
    return {
      ...cycle,
      lines: lines.map((l) => ({
        ...l, deductions: byLine.get(l.id) ?? [],
        viaVmcc: l.vmccNodeId ? !directIds.has(l.vmccNodeId) : false,
      })),
      billTotal: bill?.billTotal ?? 0,
      billPaidTotal: bill?.billPaidTotal ?? 0,
    };
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
    const locked = await this.db.transaction(async (tx) => {
      const recovered = await this.postRepayments(tx, cycle, lines);
      // Accrue the farmer milk cost: Dr Milk Purchases / Cr Payable + Cr recovered
      // advances/loans. A via_vmcc-only CC cycle has no farmer lines — that milk is
      // GL'd through the per-VMCC bills, not here — so there's nothing to accrue.
      // Skip the JE then (a single zero line would fail the ≥2-lines rule).
      const accrue = totals.net + recovered.advance + recovered.feedLoan + recovered.farmerSale > 0;
      const journalEntryId = accrue
        ? await new MpGlPoster(this.tenantId).postAccrual(tx, {
            cycleId: cycle.id, cycleNo: cycle.cycleNo, date: cycle.periodEnd,
            net: totals.net, advance: recovered.advance, feedLoan: recovered.feedLoan,
            farmerSale: recovered.farmerSale,
          })
        : null;
      const [updated] = await tx.update(mpPayoutCycles).set({
        status: 'locked', lockedAt: new Date(), journalEntryId,
        totalQty: String(round3(totals.qty)), totalGross: String(round2(totals.gross)),
        totalDeductions: String(round2(totals.ded)), totalNet: String(round2(totals.net)),
        updatedAt: new Date(),
      }).where(and(eq(mpPayoutCycles.tenantId, this.tenantId), eq(mpPayoutCycles.id, id))).returning();
      return updated!;
    });
    // Cycle is now frozen — notify each direct-mode farmer with their statement.
    // Fire-and-forget; no-ops unless the farmer-bill template is configured.
    void sendFarmerBillNotifications(this.db, this.tenantId, id)
      .catch((e) => console.error('Farmer bill WhatsApp failed:', e));
    return locked;
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
    const paidLineIds = lines.map((l) => l.lineId);
    const paid = await this.db.transaction(async (tx) => {
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
    // Confirm the disbursement to each farmer just paid. Fire-and-forget; no-ops
    // unless the farmer-payment template is configured.
    void sendCyclePaymentNotifications(this.db, this.tenantId, id, paidLineIds)
      .catch((e) => console.error('Cycle payment WhatsApp failed:', e));
    return paid;
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
      const dSale = round2(recovered.farmerSale - oldRecovered.farmerSale);
      await new MpGlPoster(this.tenantId, userId).postAccrualDelta(tx, {
        cycleId: cycle.id, cycleNo: cycle.cycleNo, date: cycle.periodEnd,
        gross: round2(dNet + dAdvance + dFeed + dSale),
        net: dNet, advance: dAdvance, feedLoan: dFeed, farmerSale: dSale,
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

  /** Sum recovered advance / feed-loan / milk-sale across a set of payout lines' deductions. */
  private async recoveredByType(db: Db | Tx, lineIds: string[]): Promise<Outstanding> {
    const recovered = zeroOutstanding();
    if (!lineIds.length) return recovered;
    const rows = await (db as Db).select({
      type: mpPayoutDeductions.deductionType, amt: sql<string>`coalesce(sum(${mpPayoutDeductions.amount}), 0)`,
    }).from(mpPayoutDeductions).where(inArray(mpPayoutDeductions.payoutLineId, lineIds)).groupBy(mpPayoutDeductions.deductionType);
    for (const r of rows) {
      const bucket = BUCKET_BY_DEDUCTION[r.type];
      if (bucket) recovered[bucket] = Number(r.amt);
    }
    return recovered;
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
    const nodeIds = await this.scopePourNodeIds(scopeNodeId);
    const conds = [
      eq(mpPours.tenantId, this.tenantId), eq(mpPours.status, 'recorded'),
      gte(mpPours.collectionDate, start), lte(mpPours.collectionDate, end),
    ];
    if (nodeIds) conds.push(inArray(mpPours.nodeId, nodeIds));
    const rows = await this.db.select({
      farmerId: mpPours.farmerId,
      qty: sql<string>`sum(${mpPours.qtyLitres})`,
      gross: sql<string>`sum(${mpPours.lineAmount})`,
      bonus: sql<string>`sum(${mpPours.bonusAmount})`,
    }).from(mpPours).where(and(...conds)).groupBy(mpPours.farmerId);
    return rows.map((r) => ({ farmerId: r.farmerId, qty: Number(r.qty), gross: Number(r.gross), bonus: Number(r.bonus) }));
  }

  /** Pour-node set a cycle scope covers, or null = no filter (whole tenant). A CC
   *  expands to its child VMCCs — per-farmer pours live at the VMCC, not the CC;
   *  a VMCC/society is itself. [] (a CC with no VMCCs) matches no rows. */
  private async scopePourNodeIds(scopeNodeId: string | null): Promise<string[] | null> {
    if (!scopeNodeId) return null;
    if (!(await this.isCcNode(scopeNodeId))) return [scopeNodeId];
    const kids = await this.db.select({ id: mpNodes.id }).from(mpNodes).where(and(
      eq(mpNodes.tenantId, this.tenantId), eq(mpNodes.parentNodeId, scopeNodeId), eq(mpNodes.nodeType, 'vmcc'),
    ));
    return kids.map((k) => k.id);
  }

  private async isCcNode(nodeId: string): Promise<boolean> {
    const [n] = await this.db.select({ type: mpNodes.nodeType }).from(mpNodes)
      .where(and(eq(mpNodes.tenantId, this.tenantId), eq(mpNodes.id, nodeId))).limit(1);
    return n?.type === 'cc';
  }

  private async computeDeductions(farmerId: string, gross: number) {
    return waterfall(await this.outstandingByType(farmerId), gross);
  }

  /** Tx-aware deduction compute — used by rebuild, after old repayments are dropped in the same tx. */
  private async computeDeductionsTx(tx: Tx, farmerId: string, gross: number) {
    return waterfall(foldOutstanding(await this.ledgerRows(tx, farmerId)), gross);
  }

  private async insertDeductions(tx: Tx, lineId: string, ded: Outstanding) {
    const rows = DEDUCTION_TYPES
      .filter(([bucket]) => ded[bucket] > 0)
      .map(([bucket, deductionType]) => ({
        tenantId: this.tenantId, payoutLineId: lineId, deductionType, amount: String(ded[bucket]),
      }));
    if (rows.length) await tx.insert(mpPayoutDeductions).values(rows);
  }

  /** Post the repayment ledger entries and return total ₹ recovered by type
   *  (drives the credit legs of the lock accrual JE). */
  private async postRepayments(
    tx: Tx, cycle: MpPayoutCycleRow, lines: MpPayoutLineRow[],
  ): Promise<Outstanding> {
    const recovered = zeroOutstanding();
    const lineIds = lines.map((l) => l.id);
    if (!lineIds.length) return recovered;
    const deds = await tx.select().from(mpPayoutDeductions).where(inArray(mpPayoutDeductions.payoutLineId, lineIds));
    const farmerByLine = new Map(lines.map((l) => [l.id, l.farmerId]));
    for (const d of deds) {
      const farmerId = farmerByLine.get(d.payoutLineId)!;
      const prev = await this.balanceTx(tx, farmerId);
      const bucket = BUCKET_BY_DEDUCTION[d.deductionType];
      if (!bucket) continue;
      recovered[bucket] += Number(d.amount);
      await tx.insert(mpFarmerLedger).values({
        tenantId: this.tenantId, farmerId, entryType: 'repayment', amount: d.amount,
        balanceAfter: String(round2(prev - Number(d.amount))),
        refType: d.deductionType,
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

  /**
   * Like assertNoOverlap but scope-specific (not tenant-inclusive), so a CC
   * cycle is never blocked by a legacy whole-tenant cycle during cutover. Two
   * cycles over one CC would double the farmer lines and the lock accrual.
   */
  private async assertNoScopeOverlap(scopeNodeId: string, start: string, end: string): Promise<void> {
    const [dup] = await this.db.select({ cycleNo: mpPayoutCycles.cycleNo }).from(mpPayoutCycles).where(and(
      eq(mpPayoutCycles.tenantId, this.tenantId), eq(mpPayoutCycles.scopeNodeId, scopeNodeId),
      ne(mpPayoutCycles.status, 'reversed'),
      lte(mpPayoutCycles.periodStart, end), gte(mpPayoutCycles.periodEnd, start),
    )).limit(1);
    if (dup) throw new ConflictError(`Cycle ${dup.cycleNo} already covers this centre and period`);
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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
