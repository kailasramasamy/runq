import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { mpPayoutCycles, mpPayoutLines, mpVmccBills, mpNodes } from '@runq/db';
import type { Db } from '@runq/db';
import { inScope, money, monthOf, rangeLabel, type ToPayItem, type ToPayScope } from '../types';

/** Cycles in scope by the month they end in; open cycles aren't payable yet. */
function cycleScope(scope: ToPayScope) {
  return scope.kind === 'month'
    ? and(
      inArray(mpPayoutCycles.status, ['locked', 'paid']),
      sql`date_trunc('month', ${mpPayoutCycles.periodEnd})::date = ${scope.month}`,
    )
    : eq(mpPayoutCycles.status, 'locked');
}

/**
 * Milk money: VMCC bills, and — for farmers paid directly — each locked or
 * paid cycle's direct lines. Lines settled through a VMCC bill are left to
 * that bill so nothing is counted twice. A cycle belongs to the month it ends.
 */
export async function milkItems(db: Db, tenantId: string, scope: ToPayScope): Promise<ToPayItem[]> {
  const [bills, farmers] = await Promise.all([vmccBills(db, tenantId, scope), farmerCycles(db, tenantId, scope)]);
  return [...bills, ...farmers].filter((i) => inScope(scope, i));
}

async function vmccBills(db: Db, tenantId: string, scope: ToPayScope): Promise<ToPayItem[]> {
  const rows = await db
    .select({
      id: mpVmccBills.id, billNo: mpVmccBills.billNo, vmccNodeId: mpVmccBills.vmccNodeId, amount: mpVmccBills.totalAmount, status: mpVmccBills.status,
      node: mpNodes.name, cycleId: mpPayoutCycles.id, cycleNo: mpPayoutCycles.cycleNo,
      periodStart: mpPayoutCycles.periodStart, periodEnd: mpPayoutCycles.periodEnd,
    })
    .from(mpVmccBills)
    .innerJoin(mpPayoutCycles, eq(mpPayoutCycles.id, mpVmccBills.payoutCycleId))
    .innerJoin(mpNodes, eq(mpNodes.id, mpVmccBills.vmccNodeId))
    .where(and(
      eq(mpVmccBills.tenantId, tenantId),
      scope.kind === 'month'
        ? and(inArray(mpVmccBills.status, ['generated', 'paid']),
          sql`date_trunc('month', ${mpPayoutCycles.periodEnd})::date = ${scope.month}`)
        : eq(mpVmccBills.status, 'generated'),
    ));
  return rows.map((r): ToPayItem => ({
    id: r.id, category: 'milk', title: r.node, subtitle: `VMCC bill ${r.billNo} · cycle ${r.cycleNo}`,
    period: monthOf(r.periodEnd), subPeriod: rangeLabel(r.periodStart, r.periodEnd), subPeriodStart: r.periodStart,
    detail: { kind: 'milk_cycle', cycleId: r.cycleId, vmccNodeId: r.vmccNodeId },
    ...money(Number(r.amount), r.status === 'paid' ? Number(r.amount) : 0),
    dueDate: r.periodEnd, webLink: `/milk-procurement/billing/cycles/${r.cycleId}`, mobileLink: null,
  }));
}

async function farmerCycles(db: Db, tenantId: string, scope: ToPayScope): Promise<ToPayItem[]> {
  const settled = sql`(${mpPayoutLines.paidAt} is not null or ${mpPayoutLines.paymentId} is not null)`;
  const rows = await db
    .select({
      id: mpPayoutCycles.id, cycleNo: mpPayoutCycles.cycleNo, periodEnd: mpPayoutCycles.periodEnd, node: mpNodes.name,
      periodStart: mpPayoutCycles.periodStart,
      cycleStatus: mpPayoutCycles.status,
      farmers: sql<number>`count(*)::int`,
      total: sql<string>`sum(${mpPayoutLines.netAmount})`,
      paid: sql<string>`sum(case when ${settled} then ${mpPayoutLines.netAmount} else 0 end)`,
    })
    .from(mpPayoutLines)
    .innerJoin(mpPayoutCycles, eq(mpPayoutCycles.id, mpPayoutLines.payoutCycleId))
    .leftJoin(mpNodes, eq(mpNodes.id, mpPayoutCycles.scopeNodeId))
    .where(and(
      eq(mpPayoutLines.tenantId, tenantId),
      cycleScope(scope),
      isNull(mpPayoutLines.billId),
      sql`${mpPayoutLines.netAmount} > 0`,
    ))
    .groupBy(mpPayoutCycles.id, mpPayoutCycles.cycleNo, mpPayoutCycles.periodStart, mpPayoutCycles.periodEnd, mpPayoutCycles.status, mpNodes.name);
  return rows.map((r): ToPayItem => ({
    id: `cycle-${r.id}`, category: 'milk', title: `Farmer payout — ${r.node ?? 'all centres'}`,
    subtitle: `Cycle ${r.cycleNo} · ${r.farmers} ${r.farmers === 1 ? 'farmer' : 'farmers'}`,
    // A cycle paid as a whole may not stamp each line — trust the cycle.
    period: monthOf(r.periodEnd), subPeriod: rangeLabel(r.periodStart, r.periodEnd), subPeriodStart: r.periodStart,
    detail: { kind: 'milk_cycle', cycleId: r.id, vmccNodeId: null },
    ...money(Number(r.total), r.cycleStatus === 'paid' ? Number(r.total) : Number(r.paid)),
    dueDate: r.periodEnd, webLink: `/milk-procurement/billing/cycles/${r.id}`, mobileLink: null,
  }));
}
