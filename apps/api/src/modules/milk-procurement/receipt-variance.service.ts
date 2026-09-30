/**
 * Receipt variance: litres that went missing (or appeared) between dispatch and
 * the receiving node's own measurement, and what those litres cost to buy.
 *
 * Reads the snapshot taken at receipt (`variance_value`, priced by
 * `RawMilkCostService`) rather than re-pricing, so a past month's loss doesn't
 * move when a pour is corrected. Direct receipts are excluded — their dispatch
 * mirrors the receipt, so a variance of 0 there means "not measured", not
 * "nothing lost". Rejected litres never appear: rejection reduces the kept
 * receipt but leaves `variance_qty` alone (see MpRejectionService). Matched
 * loads are included — the per-source pattern needs them (see
 * receipt-variance-summary.ts, which does all the arithmetic).
 */

import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { mpConsignments, mpNodes, tenants } from '@runq/db';
import type { Db } from '@runq/db';
import type { ReceiptVarianceQuery, ReceiptVarianceStatementQuery } from '@runq/validators';
import { MpPrincipal, scopeConsignments } from './access-scope';
import { NotFoundError } from '../../utils/errors';
import {
  buildReport, classify, type ReceiptVarianceLine, type ReceiptVarianceReport,
} from './receipt-variance-summary';
import type { VarianceStatementData } from './variance-statement-template';

const fromNode = alias(mpNodes, 'from_node');
const toNode = alias(mpNodes, 'to_node');

export class ReceiptVarianceService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  async report(q: ReceiptVarianceQuery, principal: MpPrincipal): Promise<ReceiptVarianceReport> {
    const rows = await this.db.select({
      consignmentId: mpConsignments.id,
      consignmentNo: mpConsignments.consignmentNo,
      date: mpConsignments.collectionDate,
      shift: mpConsignments.shift,
      kind: mpConsignments.kind,
      milkType: mpConsignments.milkType,
      fromNodeId: mpConsignments.fromNodeId,
      fromNodeName: fromNode.name,
      toNodeId: mpConsignments.toNodeId,
      toNodeName: toNode.name,
      dispatchQty: mpConsignments.dispatchQty,
      varianceQty: mpConsignments.varianceQty,
      variancePct: mpConsignments.variancePct,
      unitCost: mpConsignments.varianceUnitCost,
      value: mpConsignments.varianceValue,
    }).from(mpConsignments)
      .innerJoin(fromNode, eq(fromNode.id, mpConsignments.fromNodeId))
      .innerJoin(toNode, eq(toNode.id, mpConsignments.toNodeId))
      .where(and(...this.filters(q, principal)))
      .orderBy(desc(mpConsignments.collectionDate), desc(mpConsignments.receivedAt));
    return buildReport(rows.map(toLine));
  }

  /** The same report, dressed for the PDF: who is receiving, whose tenant,
   *  which cycle. */
  async statement(
    q: ReceiptVarianceStatementQuery, principal: MpPrincipal,
  ): Promise<VarianceStatementData> {
    const [node] = await this.db.select({ name: mpNodes.name }).from(mpNodes)
      .where(and(eq(mpNodes.tenantId, this.tenantId), eq(mpNodes.id, q.toNodeId)));
    if (!node) throw new NotFoundError('Receiving centre');
    const [t] = await this.db.select({ name: tenants.name }).from(tenants)
      .where(eq(tenants.id, this.tenantId)).limit(1);
    return {
      tenantName: t?.name ?? 'Dhenu',
      nodeName: node.name,
      stage: q.stage,
      period: { from: q.from, to: q.to, label: q.label },
      report: await this.report(q, principal),
      generatedAt: new Date().toISOString(),
    };
  }

  private filters(q: ReceiptVarianceQuery, principal: MpPrincipal) {
    const scope = scopeConsignments(principal);
    return [
      eq(mpConsignments.tenantId, this.tenantId),
      eq(mpConsignments.status, 'received'),
      eq(mpConsignments.directReceive, false),
      gte(mpConsignments.collectionDate, q.from),
      lte(mpConsignments.collectionDate, q.to),
      ...(q.stage ? [eq(mpConsignments.kind, q.stage === 'pp' ? 'cc_to_pp' : 'vmcc_to_cc')] : []),
      ...(q.toNodeId ? [eq(mpConsignments.toNodeId, q.toNodeId)] : []),
      ...(q.fromNodeId ? [eq(mpConsignments.fromNodeId, q.fromNodeId)] : []),
      ...(q.milkType ? [eq(mpConsignments.milkType, q.milkType)] : []),
      ...(scope ? [scope] : []),
    ];
  }
}

type Row = {
  consignmentId: string; consignmentNo: string; date: string; shift: 'am' | 'pm' | null;
  kind: 'vmcc_to_cc' | 'cc_to_pp'; milkType: string | null;
  fromNodeId: string; fromNodeName: string; toNodeId: string; toNodeName: string;
  dispatchQty: string | null; varianceQty: string | null; variancePct: string | null;
  unitCost: string | null; value: string | null;
};

function toLine(r: Row): ReceiptVarianceLine {
  const dispatched = Number(r.dispatchQty ?? 0);
  const variance = Number(r.varianceQty ?? 0);
  const pct = Number(r.variancePct ?? 0);
  return {
    consignmentId: r.consignmentId,
    consignmentNo: r.consignmentNo,
    date: r.date,
    shift: r.shift,
    stage: r.kind === 'cc_to_pp' ? 'pp' : 'cc',
    milkType: r.milkType,
    fromNodeId: r.fromNodeId,
    fromNodeName: r.fromNodeName,
    toNodeId: r.toNodeId,
    toNodeName: r.toNodeName,
    dispatchedQty: dispatched,
    measuredQty: round3(dispatched + variance),
    varianceQty: variance,
    variancePct: pct,
    unitCost: r.unitCost == null ? null : Number(r.unitCost),
    // A matched load lost nothing, priced or not.
    varianceValue: variance === 0 ? 0 : r.value == null ? null : Number(r.value),
    ...classify(pct),
  };
}

function round3(n: number): number { return Math.round(n * 1000) / 1000; }
