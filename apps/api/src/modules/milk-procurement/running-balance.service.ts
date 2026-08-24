import { and, eq, gte, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm';
import {
  mpFarmerLedger, mpFarmerMemberships, mpFarmers, mpGlSettings, mpNodes,
  mpPayoutCycles, mpPayoutDeductions, mpPayoutLines, mpPours,
} from '@runq/db';
import type { Db } from '@runq/db';
import { NotFoundError } from '../../utils/errors';
import { MpPrincipal, assertNodeAccess } from './access-scope';
import {
  BUCKET_BY_DEDUCTION, foldOutstanding, waterfall, zeroOutstanding, type Outstanding,
} from './farmer-ledger';
import { computeCurrentPeriod, istToday } from './cycle-window';
import { OperatorPayoutService } from './operator-payout.service';
import { ReportService } from './report.service';

/** One farmer's position in the window still being collected into. */
export interface RunningFarmerRow {
  farmerId: string;
  farmerName: string;
  farmerCode: string;
  vmccNodeId: string | null;
  qtyLitres: number;
  gross: number;
  /** Everything the farmer owes, whether or not this cycle can recover it. */
  outstanding: Outstanding;
  /** The slice of [outstanding] this cycle's gross actually covers. */
  deductions: Outstanding & { total: number };
  netPayable: number;
}

export interface RunningTotals {
  qtyLitres: number;
  /** Milk value before dues are recovered — operator comp is NOT in here. */
  gross: number;
  deductionTotal: number;
  /** Operator commission/salary/rent riding on the same bill. CC-level only. */
  operatorComp: number;
  netPayable: number;
  farmerCount: number;
}

/** One VMCC's running settlement under a CC — milk plus its operator's comp. */
export interface RunningVmccRow {
  vmccNodeId: string;
  vmccName: string;
  vmccCode: string;
  qtyLitres: number;
  milkCost: number;
  farmerCount: number;
  commission: number;
  salary: number;
  rent: number;
  total: number;
}

export interface RunningBalance {
  /** null = the tenant has no cadence configured, so there is no window to read. */
  periodStart: string | null;
  periodEnd: string | null;
  cycleDays: number | null;
  /** Set once a cycle row exists for this window; `frozen` means its numbers are
   *  read off the generated lines rather than recomputed. */
  cycleId: string | null;
  cycleStatus: string | null;
  frozen: boolean;
  farmers: RunningFarmerRow[];
  vmccs: RunningVmccRow[];
  totals: RunningTotals;
}

const EMPTY_TOTALS: RunningTotals = {
  qtyLitres: 0, gross: 0, deductionTotal: 0, operatorComp: 0, netPayable: 0, farmerCount: 0,
};

/**
 * What a cycle would pay if it were billed right now.
 *
 * Cycles are generated only once their window has closed, so mid-fortnight
 * there is no `mp_payout_lines` row to read and the app has nothing to show —
 * yet "what do I owe this farmer today" is the question asked at the counter,
 * before any bill exists. This recomputes that figure live from the same two
 * inputs generation uses: pours in the open window, and the farmer's ledger run
 * through `waterfall()`. Milk sold to the farmer and advances both sit in that
 * ledger, so both net off here exactly as they will on the bill.
 *
 * Strictly read-only — unlike the billing preview, it never resolves-or-creates
 * a cycle, so opening the screen can't leave a row behind.
 */
export class RunningBalanceService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async forNode(
    nodeId: string, principal: MpPrincipal, farmerId?: string, today = istToday(),
  ): Promise<RunningBalance> {
    if (principal.kind === 'operator') assertNodeAccess(principal, nodeId);
    const [node] = await this.db.select({
      id: mpNodes.id, nodeType: mpNodes.nodeType, parentNodeId: mpNodes.parentNodeId,
    }).from(mpNodes).where(and(eq(mpNodes.tenantId, this.tenantId), eq(mpNodes.id, nodeId))).limit(1);
    if (!node) throw new NotFoundError('Node not found');

    const [settings] = await this.db.select({ cycleDays: mpGlSettings.cycleDays })
      .from(mpGlSettings).where(eq(mpGlSettings.tenantId, this.tenantId)).limit(1);
    const cycleDays = settings?.cycleDays ?? null;
    const period = cycleDays ? computeCurrentPeriod(cycleDays, today) : null;
    if (!period) {
      return {
        periodStart: null, periodEnd: null, cycleDays, cycleId: null, cycleStatus: null,
        frozen: false, farmers: [], vmccs: [], totals: { ...EMPTY_TOTALS },
      };
    }

    // Cycles are CC-scoped, so a VMCC's window belongs to its parent CC.
    const scopeNodeId = node.nodeType === 'vmcc' ? node.parentNodeId ?? node.id : node.id;
    const cycle = await this.liveCycle(scopeNodeId, period);
    // An `open` cycle has posted no repayments yet, so recomputing from the
    // ledger matches it exactly. Once locked the repayments ARE in the ledger —
    // recomputing would deduct the same advance twice — so the lines win.
    const frozen = !!cycle && cycle.status !== 'open';

    const vmccIds = node.nodeType === 'cc' ? await this.childVmccIds(node.id) : [node.id];
    const farmers = frozen
      ? await this.fromLines(cycle!.id, vmccIds, farmerId)
      : await this.fromPours(period, vmccIds, farmerId);

    const vmccs = node.nodeType === 'cc' && !farmerId
      ? await this.rollUpVmccs(farmers, vmccIds, period)
      : [];
    return {
      periodStart: period.start, periodEnd: period.end, cycleDays,
      cycleId: cycle?.id ?? null, cycleStatus: cycle?.status ?? null, frozen,
      farmers, vmccs,
      // A CC's payable is NOT its farmers' sum: centres bought in bulk have no
      // farmer lines at all (their milk arrives as direct receipts), and every
      // centre's operator comp settles on the same bill. Summing farmers there
      // reported ₹0 for a CC that owed lakhs.
      totals: node.nodeType === 'cc' ? ccTotals(farmers, vmccs) : totalOf(farmers),
    };
  }

  /** The non-reversed cycle covering this window, if one has been generated. */
  private async liveCycle(scopeNodeId: string, period: { start: string; end: string }) {
    const [cycle] = await this.db.select({ id: mpPayoutCycles.id, status: mpPayoutCycles.status })
      .from(mpPayoutCycles).where(and(
        eq(mpPayoutCycles.tenantId, this.tenantId),
        ne(mpPayoutCycles.status, 'reversed'),
        or(eq(mpPayoutCycles.scopeNodeId, scopeNodeId), isNull(mpPayoutCycles.scopeNodeId)),
        lte(mpPayoutCycles.periodStart, period.end),
        gte(mpPayoutCycles.periodEnd, period.start),
      )).limit(1);
    return cycle ?? null;
  }

  /** Live compute: pours in the window, netted against the ledger as-is. */
  private async fromPours(
    period: { start: string; end: string }, vmccIds: string[], farmerId?: string,
  ): Promise<RunningFarmerRow[]> {
    if (!vmccIds.length) return [];
    const conds = [
      eq(mpPours.tenantId, this.tenantId), eq(mpPours.status, 'recorded'),
      gte(mpPours.collectionDate, period.start), lte(mpPours.collectionDate, period.end),
      inArray(mpPours.nodeId, vmccIds),
    ];
    if (farmerId) conds.push(eq(mpPours.farmerId, farmerId));
    const rows = await this.db.select({
      farmerId: mpPours.farmerId,
      farmerName: mpFarmers.name,
      farmerCode: mpFarmers.code,
      nodeId: mpPours.nodeId,
      qty: sql<string>`coalesce(sum(${mpPours.qtyLitres}), 0)`,
      gross: sql<string>`coalesce(sum(${mpPours.lineAmount}), 0)`,
    }).from(mpPours)
      .innerJoin(mpFarmers, eq(mpFarmers.id, mpPours.farmerId))
      .where(and(...conds))
      .groupBy(mpPours.farmerId, mpFarmers.name, mpFarmers.code, mpPours.nodeId);
    if (!rows.length) return [];

    const owed = await this.outstandingFor(rows.map((r) => r.farmerId));
    return rows.map((r) => {
      const gross = round2(Number(r.gross));
      const outstanding = owed.get(r.farmerId) ?? zeroOutstanding();
      const deductions = waterfall(outstanding, gross);
      return {
        farmerId: r.farmerId, farmerName: r.farmerName, farmerCode: r.farmerCode,
        vmccNodeId: r.nodeId,
        qtyLitres: round3(Number(r.qty)), gross, outstanding, deductions,
        netPayable: round2(gross - deductions.total),
      };
    }).sort((a, b) => a.farmerName.localeCompare(b.farmerName));
  }

  /** Frozen read: a locked/paid cycle's own lines are the answer. */
  private async fromLines(
    cycleId: string, vmccIds: string[], farmerId?: string,
  ): Promise<RunningFarmerRow[]> {
    if (!vmccIds.length) return [];
    const conds = [
      eq(mpPayoutLines.tenantId, this.tenantId), eq(mpPayoutLines.payoutCycleId, cycleId),
      inArray(mpFarmerMemberships.nodeId, vmccIds),
    ];
    if (farmerId) conds.push(eq(mpPayoutLines.farmerId, farmerId));
    const rows = await this.db.select({
      id: mpPayoutLines.id, farmerId: mpPayoutLines.farmerId,
      farmerName: mpFarmers.name, farmerCode: mpFarmers.code,
      nodeId: mpFarmerMemberships.nodeId,
      qty: mpPayoutLines.qtyLitres, gross: mpPayoutLines.grossAmount, net: mpPayoutLines.netAmount,
    }).from(mpPayoutLines)
      .innerJoin(mpFarmers, eq(mpFarmers.id, mpPayoutLines.farmerId))
      .innerJoin(mpFarmerMemberships, and(
        eq(mpFarmerMemberships.farmerId, mpPayoutLines.farmerId),
        eq(mpFarmerMemberships.tenantId, this.tenantId),
        eq(mpFarmerMemberships.isPrimary, true),
        isNull(mpFarmerMemberships.leftOn),
      ))
      .where(and(...conds));
    if (!rows.length) return [];

    const [taken, owed] = await Promise.all([
      this.deductionsByLine(rows.map((r) => r.id)),
      this.outstandingFor(rows.map((r) => r.farmerId)),
    ]);
    return rows.map((r) => {
      const ded = taken.get(r.id) ?? zeroOutstanding();
      return {
        farmerId: r.farmerId, farmerName: r.farmerName, farmerCode: r.farmerCode,
        vmccNodeId: r.nodeId,
        qtyLitres: round3(Number(r.qty)), gross: round2(Number(r.gross)),
        // What is still owed AFTER this cycle's recovery — the repayment rows
        // are already in the ledger, so the fold reflects the post-cycle state.
        outstanding: owed.get(r.farmerId) ?? zeroOutstanding(),
        deductions: { ...ded, total: round2(ded.farmerSale + ded.advance + ded.feedLoan) },
        netPayable: round2(Number(r.net)),
      };
    }).sort((a, b) => a.farmerName.localeCompare(b.farmerName));
  }

  /** Per-bucket outstanding for a set of farmers, from one ledger sweep. */
  private async outstandingFor(farmerIds: string[]): Promise<Map<string, Outstanding>> {
    const out = new Map<string, Outstanding>();
    const ids = [...new Set(farmerIds)];
    if (!ids.length) return out;
    const rows = await this.db.select({
      farmerId: mpFarmerLedger.farmerId, entryType: mpFarmerLedger.entryType,
      refType: mpFarmerLedger.refType, amount: mpFarmerLedger.amount,
    }).from(mpFarmerLedger).where(and(
      eq(mpFarmerLedger.tenantId, this.tenantId), inArray(mpFarmerLedger.farmerId, ids),
    ));
    const byFarmer = new Map<string, typeof rows>();
    for (const r of rows) {
      const cur = byFarmer.get(r.farmerId) ?? [];
      cur.push(r);
      byFarmer.set(r.farmerId, cur);
    }
    for (const id of ids) out.set(id, foldOutstanding(byFarmer.get(id) ?? []));
    return out;
  }

  private async deductionsByLine(lineIds: string[]): Promise<Map<string, Outstanding>> {
    const out = new Map<string, Outstanding>();
    if (!lineIds.length) return out;
    const rows = await this.db.select({
      lineId: mpPayoutDeductions.payoutLineId, type: mpPayoutDeductions.deductionType,
      amount: mpPayoutDeductions.amount,
    }).from(mpPayoutDeductions).where(inArray(mpPayoutDeductions.payoutLineId, lineIds));
    for (const r of rows) {
      const bucket = BUCKET_BY_DEDUCTION[r.type];
      if (!bucket) continue;
      const cur = out.get(r.lineId) ?? zeroOutstanding();
      cur[bucket] = round2(cur[bucket] + Number(r.amount));
      out.set(r.lineId, cur);
    }
    return out;
  }

  /**
   * Per-VMCC settlement under a CC: its farmers' net, plus the operator comp
   * that rides on the same bill. A VMCC with no farmers is settled in bulk, so
   * its milk comes from the CC's direct receipts instead — the same two sources
   * VmccBillService.milkByVmcc reads when the real bill is cut.
   */
  private async rollUpVmccs(
    farmers: RunningFarmerRow[], vmccIds: string[], period: { start: string; end: string },
  ): Promise<RunningVmccRow[]> {
    if (!vmccIds.length) return [];
    const nodes = await this.db.select({ id: mpNodes.id, name: mpNodes.name, code: mpNodes.code })
      .from(mpNodes).where(and(eq(mpNodes.tenantId, this.tenantId), inArray(mpNodes.id, vmccIds)));

    const milk = new Map<string, { qty: number; cost: number; farmers: number }>();
    for (const f of farmers) {
      if (!f.vmccNodeId) continue;
      const cur = milk.get(f.vmccNodeId) ?? { qty: 0, cost: 0, farmers: 0 };
      cur.qty = round3(cur.qty + f.qtyLitres);
      cur.cost = round2(cur.cost + f.netPayable);
      cur.farmers += 1;
      milk.set(f.vmccNodeId, cur);
    }
    const [comp, priced] = await Promise.all([
      new OperatorPayoutService(this.db, this.tenantId).commissionByNode(vmccIds, period.start, period.end),
      new ReportService(this.db, this.tenantId).pricedDrGross(period.start, period.end, undefined),
    ]);
    const wanted = new Set(vmccIds);
    for (const g of priced) {
      if (!wanted.has(g.fromNodeId)) continue;
      const cur = milk.get(g.fromNodeId) ?? { qty: 0, cost: 0, farmers: 0 };
      cur.qty = round3(cur.qty + g.qty);
      cur.cost = round2(cur.cost + g.gross);
      milk.set(g.fromNodeId, cur);
    }

    return nodes.map((n) => {
      const m = milk.get(n.id) ?? { qty: 0, cost: 0, farmers: 0 };
      const c = comp.get(n.id) ?? { commission: 0, salary: 0, rent: 0, total: 0, operatorIds: [] };
      return {
        vmccNodeId: n.id, vmccName: n.name, vmccCode: n.code,
        qtyLitres: m.qty, milkCost: m.cost, farmerCount: m.farmers,
        commission: c.commission, salary: c.salary, rent: c.rent,
        total: round2(m.cost + c.total),
      };
    }).filter((v) => v.total > 0 || v.qtyLitres > 0)
      .sort((a, b) => a.vmccName.localeCompare(b.vmccName));
  }

  private async childVmccIds(ccNodeId: string): Promise<string[]> {
    const rows = await this.db.select({ id: mpNodes.id }).from(mpNodes).where(and(
      eq(mpNodes.tenantId, this.tenantId), eq(mpNodes.parentNodeId, ccNodeId),
      eq(mpNodes.nodeType, 'vmcc'), eq(mpNodes.isActive, true),
    ));
    return rows.map((r) => r.id);
  }
}

function totalOf(farmers: RunningFarmerRow[]): RunningTotals {
  return {
    qtyLitres: round3(farmers.reduce((s, f) => s + f.qtyLitres, 0)),
    gross: round2(farmers.reduce((s, f) => s + f.gross, 0)),
    deductionTotal: round2(farmers.reduce((s, f) => s + f.deductions.total, 0)),
    operatorComp: 0,
    netPayable: round2(farmers.reduce((s, f) => s + f.netPayable, 0)),
    farmerCount: farmers.length,
  };
}

/** A CC settles per VMCC, so its roll-up — not the farmer list — is the total.
 *  Dues still come from the farmer rows: only they can carry a deduction. */
function ccTotals(farmers: RunningFarmerRow[], vmccs: RunningVmccRow[]): RunningTotals {
  const deductionTotal = round2(farmers.reduce((s, f) => s + f.deductions.total, 0));
  const comp = round2(vmccs.reduce((s, v) => s + v.commission + v.salary + v.rent, 0));
  const milk = round2(vmccs.reduce((s, v) => s + v.milkCost, 0));
  return {
    qtyLitres: round3(vmccs.reduce((s, v) => s + v.qtyLitres, 0)),
    // Milk before recovery, so gross − dues + comp lands back on netPayable.
    gross: round2(milk + deductionTotal),
    deductionTotal,
    operatorComp: comp,
    netPayable: round2(vmccs.reduce((s, v) => s + v.total, 0)),
    farmerCount: farmers.length,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
