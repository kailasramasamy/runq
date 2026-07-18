import { and, eq, sql, inArray, isNull, desc, gte, lte, ne } from 'drizzle-orm';
import {
  mpVmccBills, mpPayoutCycles, mpPayoutLines, mpFarmers, mpFarmerMemberships, mpNodes, mpGlSettings,
  mpNodeOperators, mpOperatorPayouts, payments, tenants,
} from '@runq/db';
import type { Db, MpVmccBillRow, MpPayoutCycleRow } from '@runq/db';
import { applyPagination, calcTotalPages } from '@runq/db';
import type { PaginationMeta } from '@runq/types';
import type {
  BillingPeriod, GenerateVmccBillsInput, PayVmccBillInput, SettleOperatorInput, VmccBillFilter,
} from '@runq/validators';
import { ConflictError, NotFoundError } from '../../utils/errors';
import { PayoutService } from './payout.service';
import { nextDocNo } from './numbering';
import { MpGlPoster } from './gl-poster';
import { OperatorPayoutService, type OperatorPayoutLine } from './operator-payout.service';
import { ReportService } from './report.service';
import { MpPrincipal, assertNodeAccess } from './access-scope';

/** [start, end] ISO dates for a calendar half-month. `first` → 1–15, `second` → 16–EOM. */
export function periodFromSelection(p: BillingPeriod): { periodStart: string; periodEnd: string } {
  const mm = String(p.month).padStart(2, '0');
  if (p.half === 'first') return { periodStart: `${p.year}-${mm}-01`, periodEnd: `${p.year}-${mm}-15` };
  const eom = new Date(Date.UTC(p.year, p.month, 0)).getUTCDate();
  return { periodStart: `${p.year}-${mm}-16`, periodEnd: `${p.year}-${mm}-${eom}` };
}

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** One VMCC's settleable amounts for a cycle (compute-on-the-fly preview row). */
export interface BillableVmcc {
  vmccNodeId: string; vmccName: string; vmccCode: string; payeeVendorId: string | null;
  milkCost: number; qtyLitres: number; farmerCount: number;
  commission: number; salary: number; rent: number; total: number;
  bill: MpVmccBillRow | null;
}

interface MilkRollup {
  milkCost: number; qtyLitres: number; farmerCount: number;
  /** The part of [milkCost] that came from farmer payout lines, and so was
   * already credited to Farmer Payable at cycle lock. The remainder is bulk
   * milk bought straight from the VMCC, which never accrued — the two settle to
   * different accounts. See postBillMilkPayment. */
  accruedCost: number;
}

/** One day+shift of a bulk VMCC's supply, priced. */
export interface VmccBillDetailLine {
  date: string;
  shift: 'am' | 'pm';
  milkType: string;
  qtyLitres: number;
  fat: number | null;
  snf: number | null;
  water: number | null;
  /** Null = no chart matched this QC, so the line contributed ₹0. */
  ratePerLitre: number | null;
  amount: number;
}

export interface VmccBillDetail {
  periodStart: string;
  periodEnd: string;
  lines: VmccBillDetailLine[];
  totalQty: number;
  totalAmount: number;
  /** Surfaced rather than hidden: an unpriced day silently lowers the bill. */
  unpricedLines: number;
}

/** One VMCC's direct-to-farmer settlement rollup for a period (payment tracking). */
export interface DirectPaymentRow {
  vmccNodeId: string; vmccName: string; vmccCode: string;
  farmerCount: number; paidCount: number;
  netOwed: number; paidAmount: number; pendingAmount: number;
}

/** One farmer's bill within a direct-payment cycle. */
export interface DirectFarmerBill {
  lineId: string; farmerId: string; farmerName: string; farmerCode: string;
  vmccNodeId: string; vmccName: string;
  qtyLitres: number; grossAmount: number; deductionTotal: number; netAmount: number;
  paid: boolean; paymentReference: string | null;
}

/** Everything a direct-payment CC needs: per-VMCC totals, per-farmer bills, operator comp. */
export interface DirectDetail {
  cycleId: string | null; // the resolved cycle — needed to mark farmer lines paid
  periodStart: string; periodEnd: string; // the half-month — needed to record operator payouts
  vmccs: DirectPaymentRow[];
  farmers: DirectFarmerBill[];
  operators: OperatorPayoutLine[];
}

/** Per-cycle billing + payment-clearance rollup for the last N cycles. */
export interface CycleBillingSummary {
  cycleId: string; cycleNo: string; periodStart: string; periodEnd: string;
  cycleStatus: string; billCount: number; paidBillCount: number;
  billedTotal: number; paidTotal: number; pendingTotal: number;
}

/**
 * Per-VMCC billing — the settlement unit for `via_vmcc` VMCCs. A bill rolls up a
 * VMCC's milk cost (net payable to its farmers in a locked cycle) + its
 * operator's full comp (commission + salary + rent). Paying a bill settles the
 * farmer payable, books the commission expense, records the AP payment to the
 * VMCC vendor, and captures the transaction confirmation.
 */
export class VmccBillService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  /**
   * Compute-on-the-fly preview of billable VMCCs under a CC for a half-month
   * period. Resolves (or creates, `open`) the tenant-wide cycle so per-farmer
   * net amounts exist — no GL side-effect. Returns [] if the period has no
   * recorded collections yet.
   */
  async listBillable(sel: BillingPeriod, ccNodeId: string, principal?: MpPrincipal): Promise<BillableVmcc[]> {
    if (principal?.kind === 'operator') assertNodeAccess(principal, ccNodeId);
    const cycle = await this.resolveCycle(sel, { lock: false });
    if (!cycle) return [];
    const cycleId = cycle.id;
    const vmccs = await this.candidateVmccs(ccNodeId);
    if (!vmccs.length) return [];
    const ids = vmccs.map((v) => v.id);
    const period = { start: cycle.periodStart, end: cycle.periodEnd };
    const [milk, comp, bills] = await Promise.all([
      this.milkByVmcc(this.db, cycleId, ids, period),
      new OperatorPayoutService(this.db, this.tenantId).commissionByNode(ids, cycle.periodStart, cycle.periodEnd),
      this.billsByVmcc(cycleId, ids),
    ]);
    return vmccs.map((v) => {
      const m = milk.get(v.id) ?? { milkCost: 0, qtyLitres: 0, farmerCount: 0, accruedCost: 0 };
      const c = comp.get(v.id) ?? { commission: 0, salary: 0, rent: 0, total: 0, operatorIds: [] };
      return {
        vmccNodeId: v.id, vmccName: v.name, vmccCode: v.code, payeeVendorId: v.payeeVendorId,
        milkCost: m.milkCost, qtyLitres: m.qtyLitres, farmerCount: m.farmerCount,
        commission: c.commission, salary: c.salary, rent: c.rent,
        total: round2(m.milkCost + c.total), bill: bills.get(v.id) ?? null,
      };
    });
  }

  /**
   * How one VMCC's bill was arrived at: a row per collection day and shift with
   * the qty-weighted QC, the rate it priced at, and the amount. Bulk VMCCs have
   * no farmer lines, so the CC's receipts are the only record of the milk — this
   * is the audit trail behind the bill's milk cost.
   */
  async billDetail(
    sel: BillingPeriod, vmccNodeId: string, principal?: MpPrincipal,
  ): Promise<VmccBillDetail> {
    if (principal?.kind === 'operator') assertNodeAccess(principal, vmccNodeId);
    const { periodStart, periodEnd } = periodFromSelection(sel);
    const priced = (await new ReportService(this.db, this.tenantId)
      .pricedDrGross(periodStart, periodEnd, undefined, principal))
      .filter((g) => g.fromNodeId === vmccNodeId);
    const lines: VmccBillDetailLine[] = priced
      .map((g) => ({
        date: g.date, shift: g.shift, milkType: g.milkType, qtyLitres: g.qty,
        fat: g.fat, snf: g.snf, water: g.water,
        ratePerLitre: g.ratePerLitre, amount: g.gross,
      }))
      .sort((a, b) => (a.date === b.date ? a.shift.localeCompare(b.shift) : a.date.localeCompare(b.date)));
    return {
      periodStart, periodEnd, lines,
      totalQty: round2(lines.reduce((s, l) => s + l.qtyLitres, 0)),
      totalAmount: round2(lines.reduce((s, l) => s + l.amount, 0)),
      unpricedLines: lines.filter((l) => l.ratePerLitre == null).length,
    };
  }

  /**
   * The same detail plus the header a bill PDF needs: VMCC + CC names, tenant
   * name, and the operator commission folded into a via_vmcc bill. Kept separate
   * from [billDetail] so the on-screen modal stays a lean query.
   */
  async billStatementData(sel: BillingPeriod, vmccNodeId: string, principal?: MpPrincipal) {
    const detail = await this.billDetail(sel, vmccNodeId, principal);
    const [vmcc] = await this.db.select({
      name: mpNodes.name, code: mpNodes.code, parentNodeId: mpNodes.parentNodeId,
    }).from(mpNodes).where(and(eq(mpNodes.tenantId, this.tenantId), eq(mpNodes.id, vmccNodeId)));
    const [cc] = vmcc?.parentNodeId
      ? await this.db.select({ name: mpNodes.name }).from(mpNodes)
        .where(and(eq(mpNodes.tenantId, this.tenantId), eq(mpNodes.id, vmcc.parentNodeId)))
      : [undefined];
    const [tenant] = await this.db.select({ name: tenants.name }).from(tenants)
      .where(eq(tenants.id, this.tenantId));
    // Commission is only part of the bill for a via_vmcc VMCC; a direct one pays
    // its operators separately, so it stays off this document.
    const wanted = await this.vmccsByMode(vmcc?.parentNodeId ?? '', 'via_vmcc');
    const isViaVmcc = wanted.some((v) => v.id === vmccNodeId);
    const commission = isViaVmcc
      ? round2((await new OperatorPayoutService(this.db, this.tenantId)
          .compute({ from: detail.periodStart, to: detail.periodEnd, nodeId: vmccNodeId })).lines
          .reduce((s, l) => s + l.total, 0))
      : 0;
    return {
      tenantName: tenant?.name ?? 'runq',
      vmcc: { name: vmcc?.name ?? '', code: vmcc?.code ?? '', ccName: cc?.name ?? null },
      detail, commission,
    };
  }

  /**
   * Direct-to-farmer detail for a period: per-VMCC totals, the individual farmer
   * bills (you pay each farmer), and the VMCC operators' commission/salary
   * (paid separately, not folded into a VMCC bill as in via_vmcc mode).
   */
  async directDetail(sel: BillingPeriod, ccNodeId: string, principal?: MpPrincipal): Promise<DirectDetail> {
    if (principal?.kind === 'operator') assertNodeAccess(principal, ccNodeId);
    const { periodStart, periodEnd } = periodFromSelection(sel);
    const vmccs = await this.vmccsByMode(ccNodeId, 'direct_to_farmer');
    if (!vmccs.length) return { cycleId: null, periodStart, periodEnd, vmccs: [], farmers: [], operators: [] };
    const ids = vmccs.map((v) => v.id);
    const cycle = await this.resolveCycle(sel, { lock: false });
    const [farmers, operators] = await Promise.all([
      cycle ? this.farmerBills(cycle.id, vmccs) : Promise.resolve([]),
      this.operatorComp(ids, periodStart, periodEnd),
    ]);
    return { cycleId: cycle?.id ?? null, periodStart, periodEnd, vmccs: rollupFarmerBills(farmers, vmccs), farmers, operators };
  }

  /**
   * Rebuild a direct-mode CC's farmer lines from corrected pours (milk-data fix).
   * Commission/salary already recompute live on read; this refreshes the milk
   * figures. No-op (rebuilt=false) once anything in the cycle is paid.
   */
  async regenerateDirect(sel: BillingPeriod, ccNodeId: string, principal?: MpPrincipal, userId?: string): Promise<{ rebuilt: boolean }> {
    if (principal?.kind === 'operator') assertNodeAccess(principal, ccNodeId);
    const cycle = await this.resolveCycle(sel, { lock: false });
    if (!cycle) return { rebuilt: false };
    const rebuilt = await new PayoutService(this.db, this.tenantId).rebuildCycleLines(cycle.id, userId);
    return { rebuilt };
  }

  /** Per-farmer bills for a cycle, scoped to a set of VMCCs (by primary membership). */
  private async farmerBills(cycleId: string, vmccs: { id: string; name: string }[]): Promise<DirectFarmerBill[]> {
    const nameById = new Map(vmccs.map((v) => [v.id, v.name]));
    const rows = await this.db.select({
      lineId: mpPayoutLines.id, farmerId: mpPayoutLines.farmerId,
      farmerName: mpFarmers.name, farmerCode: mpFarmers.code, vmccNodeId: mpFarmerMemberships.nodeId,
      qtyLitres: mpPayoutLines.qtyLitres, grossAmount: mpPayoutLines.grossAmount,
      deductionTotal: mpPayoutLines.deductionTotal, netAmount: mpPayoutLines.netAmount,
      paidAt: mpPayoutLines.paidAt, paymentReference: mpPayoutLines.paymentReference,
    }).from(mpPayoutLines)
      .innerJoin(mpFarmers, eq(mpFarmers.id, mpPayoutLines.farmerId))
      .innerJoin(mpFarmerMemberships, and(
        eq(mpFarmerMemberships.farmerId, mpPayoutLines.farmerId), eq(mpFarmerMemberships.tenantId, this.tenantId),
        eq(mpFarmerMemberships.isPrimary, true), isNull(mpFarmerMemberships.leftOn),
      ))
      .where(and(
        eq(mpPayoutLines.tenantId, this.tenantId), eq(mpPayoutLines.payoutCycleId, cycleId),
        inArray(mpFarmerMemberships.nodeId, vmccs.map((v) => v.id)),
      )).orderBy(mpFarmerMemberships.nodeId, mpFarmers.name);
    return rows.map((r) => ({
      lineId: r.lineId, farmerId: r.farmerId, farmerName: r.farmerName, farmerCode: r.farmerCode,
      vmccNodeId: r.vmccNodeId, vmccName: nameById.get(r.vmccNodeId) ?? '',
      qtyLitres: Number(r.qtyLitres), grossAmount: Number(r.grossAmount),
      deductionTotal: Number(r.deductionTotal), netAmount: Number(r.netAmount),
      paid: r.paidAt != null, paymentReference: r.paymentReference,
    }));
  }

  /** VMCC operators' comp for the period (commission/salary/rent + paid flag). */
  private async operatorComp(nodeIds: string[], from: string, to: string): Promise<OperatorPayoutLine[]> {
    const { lines } = await new OperatorPayoutService(this.db, this.tenantId).compute({ from, to });
    const wanted = new Set(nodeIds);
    return lines.filter((l) => wanted.has(l.nodeId) && l.total > 0);
  }

  /**
   * Generate — or regenerate — bills for a half-month period. Resolves + LOCKS
   * the tenant-wide cycle (posts the period accrual once). Per eligible VMCC:
   *   • no bill → create it (from current data);
   *   • generated bill → refresh its amounts (data may have been corrected);
   *   • reversed bill → revive it (reverse → correct → regenerate loop);
   *   • paid bill → skip (frozen — reverse it first to change it).
   */
  async generate(input: GenerateVmccBillsInput, principal?: MpPrincipal, userId?: string): Promise<MpVmccBillRow[]> {
    const open = await this.resolveCycle(input, { lock: false });
    if (!open) throw new ConflictError('No recorded collections in this period');
    // Refresh unpaid farmer lines from current pours (milk-data corrections);
    // paid farmers stay frozen, GL adjusted by the delta.
    await new PayoutService(this.db, this.tenantId).rebuildCycleLines(open.id, userId);
    const cycle = await this.resolveCycle(input, { lock: true, userId });
    if (!cycle) throw new ConflictError('No recorded collections in this period');
    const rows = (await this.listBillable(input, input.ccNodeId, principal))
      .filter((r) => (input.vmccNodeId ? r.vmccNodeId === input.vmccNodeId : true));
    return this.db.transaction(async (tx) => {
      const out: MpVmccBillRow[] = [];
      for (const r of rows) {
        const snap = {
          payeeVendorId: r.payeeVendorId, milkCost: String(r.milkCost), commission: String(r.commission),
          salary: String(r.salary), rent: String(r.rent), totalAmount: String(r.total),
          qtyLitres: String(r.qtyLitres), farmerCount: r.farmerCount,
        };
        const status = r.bill?.status;
        const hasAmount = r.milkCost > 0 || r.total > 0;
        if (status === 'paid') continue;
        if (status === 'generated' || (status === 'reversed' && hasAmount)) {
          const [u] = await tx.update(mpVmccBills).set({
            ...snap, status: 'generated', paymentId: null, milkJournalEntryId: null, commissionJournalEntryId: null,
            txnReference: null, paymentMode: null, paymentDate: null, paidBy: null, paidAt: null, reversedAt: null,
            updatedAt: new Date(),
          }).where(and(eq(mpVmccBills.tenantId, this.tenantId), eq(mpVmccBills.id, r.bill!.id))).returning();
          if (u) out.push(u);
        } else if (!r.bill && hasAmount) {
          const billNo = await nextDocNo(tx, this.tenantId, 'vmcc_bill', cycle.periodEnd, 'BILL');
          const [bill] = await tx.insert(mpVmccBills).values({
            tenantId: this.tenantId, billNo, payoutCycleId: cycle.id, vmccNodeId: r.vmccNodeId, ccNodeId: input.ccNodeId, ...snap,
          }).onConflictDoNothing({ target: [mpVmccBills.tenantId, mpVmccBills.payoutCycleId, mpVmccBills.vmccNodeId] })
            .returning();
          if (bill) out.push(bill);
        }
      }
      return out;
    });
  }

  /** Settle a bill: AP payment + GL (milk + commission) + operator records + txn confirmation. */
  async pay(billId: string, input: PayVmccBillInput, principal?: MpPrincipal, userId?: string): Promise<MpVmccBillRow> {
    const bill = await this.requireBill(billId);
    if (bill.status !== 'generated') throw new ConflictError(`Bill is ${bill.status}, expected generated`);
    if (principal?.kind === 'operator') assertNodeAccess(principal, bill.vmccNodeId);
    const cycle = await this.requireCycle(bill.payoutCycleId);
    if (!bill.payeeVendorId) throw new ConflictError('VMCC has no payee vendor — set one on the node first');
    await this.assertNoManualOperatorPayout(bill.vmccNodeId, cycle);
    return this.db.transaction(async (tx) => {
      const opSvc = new OperatorPayoutService(tx as unknown as Db, this.tenantId);
      // Recompute at pay time (cycle is locked, so lines are stable) — settled truth.
      const milk = (await this.milkByVmcc(tx, cycle.id, [bill.vmccNodeId],
        { start: cycle.periodStart, end: cycle.periodEnd })).get(bill.vmccNodeId)
        ?? { milkCost: 0, qtyLitres: 0, farmerCount: 0, accruedCost: 0 };
      const opLines = (await opSvc.compute({ from: cycle.periodStart, to: cycle.periodEnd, nodeId: bill.vmccNodeId })).lines;
      const commission = round2(opLines.reduce((s, l) => s + l.total, 0));
      const total = round2(milk.milkCost + commission);

      const paymentId = await this.recordPayment(tx, bill.payeeVendorId!, total, input);
      const milkJe = await new MpGlPoster(this.tenantId, userId).postBillMilkPayment(tx, {
        billId: bill.id, billNo: bill.billNo, date: input.paymentDate,
        amount: milk.milkCost, accrued: milk.accruedCost,
      });
      const commJe = await new MpGlPoster(this.tenantId, userId)
        .postBillCommission(tx, { billId: bill.id, billNo: bill.billNo, date: input.paymentDate, amount: commission });
      await this.recordOperatorPayouts(tx, opLines, cycle, input);
      await this.tagLines(tx, cycle.id, bill.vmccNodeId, bill.id, paymentId, userId);

      const [updated] = await tx.update(mpVmccBills).set({
        status: 'paid', paymentId, milkJournalEntryId: milkJe, commissionJournalEntryId: commJe,
        milkCost: String(milk.milkCost), commission: String(opLines.reduce((s, l) => s + l.commission, 0)),
        salary: String(opLines.reduce((s, l) => s + l.salary, 0)), rent: String(opLines.reduce((s, l) => s + l.rent, 0)),
        totalAmount: String(total), qtyLitres: String(milk.qtyLitres), farmerCount: milk.farmerCount,
        txnReference: input.txnReference ?? null, paymentMode: input.paymentMode, paymentDate: input.paymentDate,
        paidBy: userId ?? null, paidAt: new Date(), updatedAt: new Date(),
      }).where(and(eq(mpVmccBills.tenantId, this.tenantId), eq(mpVmccBills.id, bill.id))).returning();
      await this.maybeCloseCycle(tx, cycle.id);
      return updated!;
    });
  }

  async list(
    filters: VmccBillFilter, pagination: { page: number; limit: number }, principal?: MpPrincipal,
  ): Promise<{ data: (MpVmccBillRow & { vmccName: string; vmccCode: string })[]; meta: PaginationMeta }> {
    const { page, limit } = pagination;
    const { offset } = applyPagination(page, limit);
    const conds = [eq(mpVmccBills.tenantId, this.tenantId)];
    if (filters.cycleId) conds.push(eq(mpVmccBills.payoutCycleId, filters.cycleId));
    if (filters.ccNodeId) conds.push(eq(mpVmccBills.ccNodeId, filters.ccNodeId));
    if (filters.status) conds.push(eq(mpVmccBills.status, filters.status));
    if (principal?.kind === 'operator') {
      conds.push(principal.nodeIds.size ? inArray(mpVmccBills.vmccNodeId, [...principal.nodeIds]) : sql`false`);
    }
    const where = and(...conds);
    const [rows, countResult] = await Promise.all([
      this.db.select({ bill: mpVmccBills, vmccName: mpNodes.name, vmccCode: mpNodes.code })
        .from(mpVmccBills).innerJoin(mpNodes, eq(mpNodes.id, mpVmccBills.vmccNodeId))
        .where(where).orderBy(desc(mpVmccBills.generatedAt)).limit(limit).offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(mpVmccBills).where(where),
    ]);
    const total = countResult[0]?.count ?? 0;
    const data = rows.map((r) => ({ ...r.bill, vmccName: r.vmccName, vmccCode: r.vmccCode }));
    return { data, meta: { page, limit, total, totalPages: calcTotalPages(total, limit) } };
  }

  /**
   * The last N tenant-wide cycles with their VMCC-bill totals + payment status
   * — the "where do we stand on clearance" strip on the billing page.
   */
  async cycleBillingSummary(limit: number): Promise<CycleBillingSummary[]> {
    const cycles = await this.db.select().from(mpPayoutCycles).where(and(
      eq(mpPayoutCycles.tenantId, this.tenantId), isNull(mpPayoutCycles.scopeNodeId),
      ne(mpPayoutCycles.status, 'reversed'),
    )).orderBy(desc(mpPayoutCycles.periodStart)).limit(limit);
    if (!cycles.length) return [];
    const ids = cycles.map((c) => c.id);
    const agg = await this.db.select({
      cycleId: mpVmccBills.payoutCycleId,
      billCount: sql<number>`count(*)::int`,
      paidBillCount: sql<number>`(count(*) filter (where ${mpVmccBills.status} = 'paid'))::int`,
      billedTotal: sql<string>`coalesce(sum(${mpVmccBills.totalAmount}), 0)`,
      paidTotal: sql<string>`coalesce(sum(${mpVmccBills.totalAmount}) filter (where ${mpVmccBills.status} = 'paid'), 0)`,
    }).from(mpVmccBills).where(and(
      eq(mpVmccBills.tenantId, this.tenantId), inArray(mpVmccBills.payoutCycleId, ids),
      ne(mpVmccBills.status, 'reversed'),
    )).groupBy(mpVmccBills.payoutCycleId);
    const byCycle = new Map(agg.map((a) => [a.cycleId, a]));
    return cycles.map((c) => {
      const a = byCycle.get(c.id);
      const billed = Number(a?.billedTotal ?? 0), paid = Number(a?.paidTotal ?? 0);
      return {
        cycleId: c.id, cycleNo: c.cycleNo, periodStart: c.periodStart, periodEnd: c.periodEnd,
        cycleStatus: c.status, billCount: a?.billCount ?? 0, paidBillCount: a?.paidBillCount ?? 0,
        billedTotal: billed, paidTotal: paid, pendingTotal: round2(billed - paid),
      };
    });
  }

  /** Unwind a paid bill: inverse JEs, drop the AP payment link, clear the lines, reopen the cycle. */
  async reverse(billId: string, principal?: MpPrincipal, userId?: string): Promise<MpVmccBillRow> {
    const bill = await this.requireBill(billId);
    if (bill.status !== 'paid') throw new ConflictError(`Bill is ${bill.status}, expected paid`);
    if (principal?.kind === 'operator') assertNodeAccess(principal, bill.vmccNodeId);
    const cycle = await this.requireCycle(bill.payoutCycleId);
    return this.db.transaction(async (tx) => {
      await new MpGlPoster(this.tenantId, userId).postBillReversal(tx, {
        billId: bill.id, billNo: bill.billNo, date: bill.paymentDate ?? cycle.periodEnd,
        milkCost: Number(bill.milkCost), commission: round2(Number(bill.commission) + Number(bill.salary) + Number(bill.rent)),
      });
      await tx.update(mpPayoutLines).set({ billId: null, paymentId: null, settledViaNodeId: null, paidAt: null, paidBy: null })
        .where(and(eq(mpPayoutLines.tenantId, this.tenantId), eq(mpPayoutLines.billId, bill.id)));
      // Drop the operator payouts this bill recorded so a later re-pay recomputes cleanly.
      await tx.delete(mpOperatorPayouts).where(and(
        eq(mpOperatorPayouts.tenantId, this.tenantId), eq(mpOperatorPayouts.nodeId, bill.vmccNodeId),
        eq(mpOperatorPayouts.periodStart, cycle.periodStart), eq(mpOperatorPayouts.periodEnd, cycle.periodEnd),
      ));
      if (cycle.status === 'paid') {
        await tx.update(mpPayoutCycles).set({ status: 'locked', paidAt: null, updatedAt: new Date() })
          .where(and(eq(mpPayoutCycles.tenantId, this.tenantId), eq(mpPayoutCycles.id, cycle.id)));
      }
      const [updated] = await tx.update(mpVmccBills)
        .set({ status: 'reversed', reversedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(mpVmccBills.tenantId, this.tenantId), eq(mpVmccBills.id, bill.id))).returning();
      return updated!;
    });
  }

  // ── direct-mode per-farmer / per-operator settlement ───────────────────

  /** Settle one farmer's line: AP payment + Dr Farmer Payable/Cr Bank + txn confirmation. */
  async settleFarmer(lineId: string, input: PayVmccBillInput, principal?: MpPrincipal, userId?: string): Promise<void> {
    const [row] = await this.db.select({
      cycleId: mpPayoutLines.payoutCycleId, vendorId: mpFarmers.vendorId,
      net: mpPayoutLines.netAmount, paidAt: mpPayoutLines.paidAt, nodeId: mpFarmerMemberships.nodeId,
    }).from(mpPayoutLines)
      .innerJoin(mpFarmers, eq(mpFarmers.id, mpPayoutLines.farmerId))
      .innerJoin(mpFarmerMemberships, and(
        eq(mpFarmerMemberships.farmerId, mpPayoutLines.farmerId), eq(mpFarmerMemberships.tenantId, this.tenantId),
        eq(mpFarmerMemberships.isPrimary, true), isNull(mpFarmerMemberships.leftOn),
      ))
      .where(and(eq(mpPayoutLines.tenantId, this.tenantId), eq(mpPayoutLines.id, lineId)));
    if (!row) throw new NotFoundError('Farmer bill not found');
    if (principal?.kind === 'operator') assertNodeAccess(principal, row.nodeId);
    if (row.paidAt) throw new ConflictError('Farmer already settled');
    const net = round2(Number(row.net));
    if (net <= 0) throw new ConflictError('Nothing to pay for this farmer');
    await this.ensureLocked(row.cycleId);
    await this.db.transaction(async (tx) => {
      const [pay] = await tx.insert(payments).values({
        tenantId: this.tenantId, vendorId: row.vendorId, paymentDate: input.paymentDate, amount: String(net),
        status: 'completed', utrNumber: input.txnReference ?? null, notes: `Farmer payout (${input.paymentMode})`,
      }).returning({ id: payments.id });
      const je = await new MpGlPoster(this.tenantId, userId).postFarmerPayment(tx, { lineId, date: input.paymentDate, amount: net });
      await tx.update(mpPayoutLines).set({
        paymentId: pay!.id, paidAt: new Date(), paidBy: userId ?? null, journalEntryId: je,
        paymentReference: input.txnReference ?? null, paymentMode: input.paymentMode, paymentDate: input.paymentDate,
      }).where(and(eq(mpPayoutLines.tenantId, this.tenantId), eq(mpPayoutLines.id, lineId)));
      await this.maybeCloseCycle(tx, row.cycleId);
    });
  }

  /** Unwind a settled farmer line: inverse JE, drop the AP payment, clear the fields, reopen the cycle. */
  async reverseFarmer(lineId: string, principal?: MpPrincipal, userId?: string): Promise<void> {
    const [row] = await this.db.select({
      cycleId: mpPayoutLines.payoutCycleId, net: mpPayoutLines.netAmount, paidAt: mpPayoutLines.paidAt,
      paymentId: mpPayoutLines.paymentId, paymentDate: mpPayoutLines.paymentDate, nodeId: mpFarmerMemberships.nodeId,
    }).from(mpPayoutLines)
      .innerJoin(mpFarmerMemberships, and(
        eq(mpFarmerMemberships.farmerId, mpPayoutLines.farmerId), eq(mpFarmerMemberships.tenantId, this.tenantId),
        eq(mpFarmerMemberships.isPrimary, true), isNull(mpFarmerMemberships.leftOn),
      ))
      .where(and(eq(mpPayoutLines.tenantId, this.tenantId), eq(mpPayoutLines.id, lineId)));
    if (!row) throw new NotFoundError('Farmer bill not found');
    if (principal?.kind === 'operator') assertNodeAccess(principal, row.nodeId);
    if (!row.paidAt) throw new ConflictError('Farmer is not settled');
    await this.db.transaction(async (tx) => {
      await new MpGlPoster(this.tenantId, userId).postFarmerPayment(tx, {
        lineId, date: row.paymentDate ?? new Date().toISOString().slice(0, 10), amount: round2(Number(row.net)), reverse: true,
      });
      // Clear the line's FK to the payment before deleting the payment.
      await tx.update(mpPayoutLines).set({
        paymentId: null, paidAt: null, paidBy: null, journalEntryId: null,
        paymentReference: null, paymentMode: null, paymentDate: null,
      }).where(and(eq(mpPayoutLines.tenantId, this.tenantId), eq(mpPayoutLines.id, lineId)));
      if (row.paymentId) await tx.delete(payments).where(eq(payments.id, row.paymentId));
      await tx.update(mpPayoutCycles).set({ status: 'locked', paidAt: null, updatedAt: new Date() })
        .where(and(eq(mpPayoutCycles.tenantId, this.tenantId), eq(mpPayoutCycles.id, row.cycleId), eq(mpPayoutCycles.status, 'paid')));
    });
  }

  /** Settle one VMCC operator's comp for a period: AP payment + Dr Commission/Cr Bank + record. */
  async settleOperator(operatorId: string, input: SettleOperatorInput, principal?: MpPrincipal, userId?: string): Promise<void> {
    const [op] = await this.db.select().from(mpNodeOperators)
      .where(and(eq(mpNodeOperators.tenantId, this.tenantId), eq(mpNodeOperators.id, operatorId)));
    if (!op) throw new NotFoundError('Operator not found');
    if (principal?.kind === 'operator') assertNodeAccess(principal, op.nodeId);
    if (!op.payeeVendorId) throw new ConflictError('Operator has no payee vendor — set one first');
    const [existing] = await this.db.select({ id: mpOperatorPayouts.id }).from(mpOperatorPayouts).where(and(
      eq(mpOperatorPayouts.tenantId, this.tenantId), eq(mpOperatorPayouts.operatorId, operatorId),
      eq(mpOperatorPayouts.periodStart, input.periodStart), eq(mpOperatorPayouts.periodEnd, input.periodEnd),
    ));
    if (existing) throw new ConflictError('Operator already settled for this period');
    const { lines } = await new OperatorPayoutService(this.db, this.tenantId).compute({ from: input.periodStart, to: input.periodEnd });
    const line = lines.find((l) => l.operatorId === operatorId);
    if (!line || line.total <= 0) throw new ConflictError('No commission/salary for this operator in the period');
    await this.db.transaction(async (tx) => {
      const [pay] = await tx.insert(payments).values({
        tenantId: this.tenantId, vendorId: op.payeeVendorId!, paymentDate: input.paymentDate, amount: String(round2(line.total)),
        status: 'completed', utrNumber: input.txnReference ?? null, notes: `Operator payout (${input.paymentMode})`,
      }).returning({ id: payments.id });
      const [payout] = await tx.insert(mpOperatorPayouts).values({
        tenantId: this.tenantId, operatorId, nodeId: op.nodeId, periodStart: input.periodStart, periodEnd: input.periodEnd,
        nodeQty: String(line.nodeQty), commission: String(line.commission), salary: String(line.salary),
        rent: String(line.rent), total: String(line.total), payeeVendorId: op.payeeVendorId,
        paidOn: input.paymentDate, reference: input.txnReference ?? null, paymentMode: input.paymentMode, paymentId: pay!.id,
      }).returning({ id: mpOperatorPayouts.id });
      const je = await new MpGlPoster(this.tenantId, userId).postOperatorPayment(tx, { payoutId: payout!.id, date: input.paymentDate, amount: line.total });
      await tx.update(mpOperatorPayouts).set({ journalEntryId: je }).where(eq(mpOperatorPayouts.id, payout!.id));
    });
  }

  /** Unwind a settled operator payout: inverse JE, drop the AP payment, delete the record. */
  async reverseOperator(operatorId: string, periodStart: string, periodEnd: string, principal?: MpPrincipal, userId?: string): Promise<void> {
    const [row] = await this.db.select().from(mpOperatorPayouts).where(and(
      eq(mpOperatorPayouts.tenantId, this.tenantId), eq(mpOperatorPayouts.operatorId, operatorId),
      eq(mpOperatorPayouts.periodStart, periodStart), eq(mpOperatorPayouts.periodEnd, periodEnd),
    ));
    if (!row) throw new NotFoundError('Operator payout not found');
    if (principal?.kind === 'operator') assertNodeAccess(principal, row.nodeId);
    await this.db.transaction(async (tx) => {
      await new MpGlPoster(this.tenantId, userId).postOperatorPayment(tx, {
        payoutId: row.id, date: row.paidOn, amount: round2(Number(row.total)), reverse: true,
      });
      // Delete the payout row (it FKs the payment) before deleting the payment.
      await tx.delete(mpOperatorPayouts).where(eq(mpOperatorPayouts.id, row.id));
      if (row.paymentId) await tx.delete(payments).where(eq(payments.id, row.paymentId));
    });
  }

  /** Lock the cycle if still open so the payable is accrued before per-line settlement. */
  private async ensureLocked(cycleId: string): Promise<void> {
    const [c] = await this.db.select({ status: mpPayoutCycles.status }).from(mpPayoutCycles)
      .where(and(eq(mpPayoutCycles.tenantId, this.tenantId), eq(mpPayoutCycles.id, cycleId)));
    if (!c) throw new NotFoundError('Payout cycle not found');
    if (c.status === 'reversed') throw new ConflictError('Cycle is reversed');
    if (c.status === 'open') await new PayoutService(this.db, this.tenantId).lockCycle(cycleId);
  }

  // ── helpers ──────────────────────────────────────────────────────────

  /**
   * Find (or create) the tenant-wide cycle for a half-month period. `open` on
   * creation (no GL); `lock: true` locks it if not already, posting the accrual.
   * Returns null when the period has no recorded collections. Refuses to create
   * if a conflicting cycle already overlaps the period (would double-accrue).
   */
  async resolveCycle(sel: BillingPeriod, opts: { lock: boolean; userId?: string }): Promise<MpPayoutCycleRow | null> {
    const { periodStart, periodEnd } = periodFromSelection(sel);
    const payout = new PayoutService(this.db, this.tenantId);
    let cycle = await this.findTenantCycle(periodStart, periodEnd);
    if (!cycle) {
      await this.assertNoOverlap(periodStart, periodEnd);
      try {
        const created = await payout.createCycle({ scopeNodeId: null, periodStart, periodEnd });
        cycle = created as MpPayoutCycleRow;
      } catch (e) {
        if (e instanceof ConflictError) return null; // no recorded collections
        throw e;
      }
    }
    if (opts.lock && cycle.status === 'open') {
      cycle = await payout.lockCycle(cycle.id, undefined);
    }
    return cycle;
  }

  private async findTenantCycle(periodStart: string, periodEnd: string): Promise<MpPayoutCycleRow | null> {
    const [row] = await this.db.select().from(mpPayoutCycles).where(and(
      eq(mpPayoutCycles.tenantId, this.tenantId), isNull(mpPayoutCycles.scopeNodeId),
      eq(mpPayoutCycles.periodStart, periodStart), eq(mpPayoutCycles.periodEnd, periodEnd),
      ne(mpPayoutCycles.status, 'reversed'),
    )).limit(1);
    return row ?? null;
  }

  /** Reject creating a period cycle when a live cycle already overlaps it. */
  private async assertNoOverlap(periodStart: string, periodEnd: string): Promise<void> {
    const [existing] = await this.db.select({ cycleNo: mpPayoutCycles.cycleNo }).from(mpPayoutCycles).where(and(
      eq(mpPayoutCycles.tenantId, this.tenantId), ne(mpPayoutCycles.status, 'reversed'),
      lte(mpPayoutCycles.periodStart, periodEnd), gte(mpPayoutCycles.periodEnd, periodStart),
    )).limit(1);
    if (existing) throw new ConflictError(`Cycle ${existing.cycleNo} already overlaps this period`);
  }

  /** Active VMCCs under a CC whose effective payout mode is `via_vmcc`. */
  private async candidateVmccs(ccNodeId: string) {
    return this.vmccsByMode(ccNodeId, 'via_vmcc');
  }

  /**
   * Active VMCCs under a CC whose EFFECTIVE payout mode equals `wanted`.
   * Effective mode = vmcc.payoutMode ?? parent CC.payoutMode ?? tenant default —
   * so a direct-payment CC's VMCCs aren't billed even when their own mode is null.
   */
  private async vmccsByMode(ccNodeId: string, wanted: 'via_vmcc' | 'direct_to_farmer') {
    const [cc] = await this.db.select({ mode: mpNodes.payoutMode }).from(mpNodes)
      .where(and(eq(mpNodes.tenantId, this.tenantId), eq(mpNodes.id, ccNodeId)));
    const rows = await this.db.select({
      id: mpNodes.id, name: mpNodes.name, code: mpNodes.code,
      payeeVendorId: mpNodes.payeeVendorId, payoutMode: mpNodes.payoutMode,
    }).from(mpNodes).where(and(
      eq(mpNodes.tenantId, this.tenantId), eq(mpNodes.parentNodeId, ccNodeId),
      eq(mpNodes.nodeType, 'vmcc'), eq(mpNodes.isActive, true),
    ));
    const ccMode = cc?.mode ?? (await this.defaultPayoutMode());
    return rows.filter((r) => (r.payoutMode ?? ccMode) === wanted);
  }

  /**
   * Milk cost per VMCC, from both ways milk reaches us:
   *   • farmer-backed — Σ net of its farmers' cycle lines (grouped by primary
   *     membership). Already accrued to Farmer Payable at cycle lock.
   *   • bulk — a VMCC with no farmers of its own collects and supplies the CC,
   *     which logs a manual receipt per delivery. Priced through the same rate
   *     chart a farmer gets (the VMCC's assigned chart, matrix or flat, via
   *     scopeNodeId), since that milk exists only as those receipts.
   * The two can't double-count: pricedDrGross only reads direct_receive rows,
   * and a farmer-backed dispatch is never one.
   */
  private async milkByVmcc(
    db: Db | Tx, cycleId: string, vmccIds: string[], period: { start: string; end: string },
  ): Promise<Map<string, MilkRollup>> {
    const rows = await (db as Db).select({
      nodeId: mpFarmerMemberships.nodeId,
      milkCost: sql<string>`coalesce(sum(${mpPayoutLines.netAmount}), 0)`,
      qtyLitres: sql<string>`coalesce(sum(${mpPayoutLines.qtyLitres}), 0)`,
      farmerCount: sql<number>`count(distinct ${mpPayoutLines.farmerId})::int`,
    }).from(mpPayoutLines)
      .innerJoin(mpFarmerMemberships, and(
        eq(mpFarmerMemberships.farmerId, mpPayoutLines.farmerId),
        eq(mpFarmerMemberships.tenantId, this.tenantId),
        eq(mpFarmerMemberships.isPrimary, true),
        isNull(mpFarmerMemberships.leftOn),
      ))
      .where(and(
        eq(mpPayoutLines.tenantId, this.tenantId), eq(mpPayoutLines.payoutCycleId, cycleId),
        inArray(mpFarmerMemberships.nodeId, vmccIds),
      )).groupBy(mpFarmerMemberships.nodeId);
    const map = new Map<string, MilkRollup>(rows.map((r) => [r.nodeId, {
      milkCost: Number(r.milkCost), qtyLitres: Number(r.qtyLitres), farmerCount: r.farmerCount,
      accruedCost: Number(r.milkCost),
    }]));
    const priced = await new ReportService(db as Db, this.tenantId)
      .pricedDrGross(period.start, period.end, undefined);
    const wanted = new Set(vmccIds);
    for (const g of priced) {
      if (!wanted.has(g.fromNodeId)) continue;
      const cur = map.get(g.fromNodeId)
        ?? { milkCost: 0, qtyLitres: 0, farmerCount: 0, accruedCost: 0 };
      cur.milkCost = round2(cur.milkCost + g.gross);
      cur.qtyLitres = round2(cur.qtyLitres + g.qty);
      map.set(g.fromNodeId, cur);
    }
    return map;
  }

  private async billsByVmcc(cycleId: string, vmccIds: string[]): Promise<Map<string, MpVmccBillRow>> {
    const rows = await this.db.select().from(mpVmccBills).where(and(
      eq(mpVmccBills.tenantId, this.tenantId), eq(mpVmccBills.payoutCycleId, cycleId),
      inArray(mpVmccBills.vmccNodeId, vmccIds),
    ));
    return new Map(rows.map((b) => [b.vmccNodeId, b]));
  }

  private async recordPayment(tx: Tx, vendorId: string, amount: number, input: PayVmccBillInput): Promise<string> {
    const [pay] = await tx.insert(payments).values({
      tenantId: this.tenantId, vendorId, paymentDate: input.paymentDate, amount: String(round2(amount)),
      status: 'completed', utrNumber: input.txnReference ?? null,
      notes: `VMCC bill settlement (${input.paymentMode})`,
    }).returning({ id: payments.id });
    return pay!.id;
  }

  private async recordOperatorPayouts(
    tx: Tx, opLines: { operatorId: string; nodeId: string; nodeQty: number; commission: number; salary: number; rent: number; total: number }[],
    cycle: MpPayoutCycleRow, input: PayVmccBillInput,
  ): Promise<void> {
    for (const l of opLines) {
      if (l.total <= 0) continue;
      await tx.insert(mpOperatorPayouts).values({
        tenantId: this.tenantId, operatorId: l.operatorId, nodeId: l.nodeId,
        periodStart: cycle.periodStart, periodEnd: cycle.periodEnd, nodeQty: String(l.nodeQty),
        commission: String(l.commission), salary: String(l.salary), rent: String(l.rent), total: String(l.total),
        paidOn: input.paymentDate, reference: input.txnReference ?? null,
      }).onConflictDoNothing({
        target: [mpOperatorPayouts.tenantId, mpOperatorPayouts.operatorId, mpOperatorPayouts.periodStart, mpOperatorPayouts.periodEnd],
      });
    }
  }

  /** Tag the VMCC's cycle lines as settled via this bill. */
  private async tagLines(tx: Tx, cycleId: string, vmccNodeId: string, billId: string, paymentId: string, userId?: string): Promise<void> {
    const lineIds = await tx.select({ id: mpPayoutLines.id }).from(mpPayoutLines)
      .innerJoin(mpFarmerMemberships, and(
        eq(mpFarmerMemberships.farmerId, mpPayoutLines.farmerId),
        eq(mpFarmerMemberships.tenantId, this.tenantId),
        eq(mpFarmerMemberships.isPrimary, true), isNull(mpFarmerMemberships.leftOn),
      ))
      .where(and(
        eq(mpPayoutLines.tenantId, this.tenantId), eq(mpPayoutLines.payoutCycleId, cycleId),
        eq(mpFarmerMemberships.nodeId, vmccNodeId),
      ));
    if (!lineIds.length) return;
    await tx.update(mpPayoutLines).set({
      billId, paymentId, settledViaNodeId: vmccNodeId, paidAt: new Date(), paidBy: userId ?? null,
    }).where(inArray(mpPayoutLines.id, lineIds.map((l) => l.id)));
  }

  /** Flip the cycle to paid once every line in it has been disbursed. */
  private async maybeCloseCycle(tx: Tx, cycleId: string): Promise<void> {
    const [agg] = await tx.select({
      unpaid: sql<number>`count(*) filter (where ${mpPayoutLines.paidAt} is null)::int`,
    }).from(mpPayoutLines).where(and(eq(mpPayoutLines.tenantId, this.tenantId), eq(mpPayoutLines.payoutCycleId, cycleId)));
    if ((agg?.unpaid ?? 0) === 0) {
      await tx.update(mpPayoutCycles).set({ status: 'paid', paidAt: new Date(), updatedAt: new Date() })
        .where(and(
          eq(mpPayoutCycles.tenantId, this.tenantId), eq(mpPayoutCycles.id, cycleId), eq(mpPayoutCycles.status, 'locked'),
        ));
    }
  }

  /** Reject if an operator payout already covers this node for an overlapping period. */
  private async assertNoManualOperatorPayout(nodeId: string, cycle: MpPayoutCycleRow): Promise<void> {
    const [row] = await this.db.select({ id: mpOperatorPayouts.id }).from(mpOperatorPayouts).where(and(
      eq(mpOperatorPayouts.tenantId, this.tenantId), eq(mpOperatorPayouts.nodeId, nodeId),
      lte(mpOperatorPayouts.periodStart, cycle.periodEnd), gte(mpOperatorPayouts.periodEnd, cycle.periodStart),
    )).limit(1);
    if (row) {
      throw new ConflictError('This VMCC’s commission is already recorded for an overlapping period (Operators tab) — reverse it first');
    }
  }

  private async defaultPayoutMode(): Promise<'direct_to_farmer' | 'via_vmcc'> {
    const [s] = await this.db.select({ m: mpGlSettings.defaultPayoutMode }).from(mpGlSettings)
      .where(eq(mpGlSettings.tenantId, this.tenantId));
    return s?.m ?? 'direct_to_farmer';
  }

  private async requireCycle(id: string): Promise<MpPayoutCycleRow> {
    const [cycle] = await this.db.select().from(mpPayoutCycles)
      .where(and(eq(mpPayoutCycles.tenantId, this.tenantId), eq(mpPayoutCycles.id, id)));
    if (!cycle) throw new NotFoundError('Payout cycle not found');
    return cycle;
  }

  private async requireBill(id: string): Promise<MpVmccBillRow> {
    const [bill] = await this.db.select().from(mpVmccBills)
      .where(and(eq(mpVmccBills.tenantId, this.tenantId), eq(mpVmccBills.id, id)));
    if (!bill) throw new NotFoundError('VMCC bill not found');
    return bill;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Fold per-farmer bills into per-VMCC owed/paid/pending totals. Pure. */
function rollupFarmerBills(
  farmers: DirectFarmerBill[], vmccs: { id: string; name: string; code: string }[],
): DirectPaymentRow[] {
  const agg = new Map<string, { net: number; paid: number; farmers: number; paidCount: number }>();
  for (const f of farmers) {
    const a = agg.get(f.vmccNodeId) ?? { net: 0, paid: 0, farmers: 0, paidCount: 0 };
    a.net += f.netAmount; a.farmers += 1;
    if (f.paid) { a.paid += f.netAmount; a.paidCount += 1; }
    agg.set(f.vmccNodeId, a);
  }
  return vmccs.flatMap((v) => {
    const a = agg.get(v.id);
    if (!a || a.net <= 0) return [];
    return [{
      vmccNodeId: v.id, vmccName: v.name, vmccCode: v.code,
      farmerCount: a.farmers, paidCount: a.paidCount,
      netOwed: round2(a.net), paidAmount: round2(a.paid), pendingAmount: round2(a.net - a.paid),
    }];
  });
}
