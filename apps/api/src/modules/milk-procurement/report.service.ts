import { and, eq, ne, sql, gte, lte } from 'drizzle-orm';
import { alias, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { mpPours, mpConsignments, mpNodes } from '@runq/db';
import type { Db } from '@runq/db';
import type {
  CollectionReportQuery, ReceivedDailyQuery, PoursDailyQuery, FlowReportQuery,
  QualityTrendQuery, NodeDailyQuery,
} from '@runq/validators';
import { MpPrincipal, scopePours } from './access-scope';

/** One node's movement on a given day: what came in, what left, what remains. */
export interface FlowNode {
  nodeId: string;
  collected: number;      // recorded pours (VMCC only in practice)
  dispatchedOut: number;  // sum of dispatch on outbound consignments
  receivedIn: number;     // sum of receipt on inbound consignments
  onHand: number;         // collected + receivedIn − dispatchedOut
}

/** One from→to leg with dispatched vs received and the measured loss. */
export interface FlowEdge {
  fromNodeId: string;
  toNodeId: string;
  kind: 'vmcc_to_cc' | 'cc_to_pp';
  dispatchedQty: number;
  receivedQty: number;
  measuredLoss: number;      // dispatched − received on received legs
  variancePct: number | null;
}

export interface FlowReport {
  date: string;
  shift: 'am' | 'pm' | null;
  nodes: FlowNode[];
  edges: FlowEdge[];
  totals: {
    collected: number; dispatched: number; received: number;
    receivedAtPlant: number; measuredLoss: number;
  };
}

interface PourAgg { nodeId: string; collected: string }
interface EdgeAgg {
  fromNodeId: string; toNodeId: string; kind: 'vmcc_to_cc' | 'cc_to_pp';
  dispatchedQty: string; receivedQty: string;
}

export interface ReceivedDay {
  date: string;
  totalQty: number;
  vmccCount: number;
  fat: number | null;
  snf: number | null;
  water: number | null;
}

export interface PourDay {
  date: string;
  totalQty: number;
  farmerCount: number;
  fat: number | null;
  snf: number | null;
  water: number | null;
}

export interface CollectionMilkTypeRow {
  milkType: string;
  totalQty: number;
  amQty: number;
  pmQty: number;
  pourCount: number;
  farmerCount: number;
  avgFat: number;
  avgSnf: number;
  avgWater: number;
  grossAmount: number;
}

/** Same rollup as a milk-type row, but grouped per node. Used both per-VMCC
 * (grouped on the pour's own node) and per-CC (pours rolled up to the VMCC's
 * parent CC). */
export interface CollectionNodeRow {
  nodeId: string;
  nodeName: string;
  nodeCode: string;
  nodeType: string;
  totalQty: number;
  amQty: number;
  pmQty: number;
  pourCount: number;
  farmerCount: number;
  avgFat: number;
  avgSnf: number;
  avgWater: number;
  grossAmount: number;
}

/** One (date, milk type) qty-weighted QC point for the trend charts. */
export interface QualityTrendRow {
  date: string;
  milkType: string;
  totalQty: number;
  fat: number | null;
  snf: number | null;
  water: number | null;
}

/** The per-group collection rollup shared by the daily history views. */
export interface DayRollup {
  totalQty: number;
  amQty: number;
  pmQty: number;
  pourCount: number;
  farmerCount: number;
  avgFat: number;
  avgSnf: number;
  avgWater: number;
  grossAmount: number;
}

/** One (date, milk type) full collection rollup — same shape as the home
 * "By milk type — today" row, one per day. Powers the milk-type history view. */
export interface MilkTypeDayRow extends DayRollup {
  date: string;
  milkType: string;
}

/** One (date, node) full collection rollup — powers the per-VMCC / per-CC
 * collection history views (node picked via a dropdown on the client). */
export interface NodeDayRow extends DayRollup {
  date: string;
  nodeId: string;
  nodeName: string;
  nodeCode: string;
}

export interface CollectionSummary {
  from: string;
  to: string;
  nodeId: string | null;
  totalQty: number;
  amQty: number;
  pmQty: number;
  pourCount: number;
  farmerCount: number;
  avgFat: number;
  avgSnf: number;
  avgWater: number;
  grossAmount: number;
  byMilkType: CollectionMilkTypeRow[];
  byCc: CollectionNodeRow[];
  byNode: CollectionNodeRow[];
}

/** Collection rollups over recorded pours. */
export class ReportService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async collectionSummary(q: CollectionReportQuery, principal?: MpPrincipal): Promise<CollectionSummary> {
    const conds = [
      eq(mpPours.tenantId, this.tenantId), eq(mpPours.status, 'recorded'),
      gte(mpPours.collectionDate, q.from), lte(mpPours.collectionDate, q.to),
    ];
    if (q.nodeId) conds.push(eq(mpPours.nodeId, q.nodeId));
    if (principal) {
      const scope = scopePours(principal);
      if (scope) conds.push(scope);
    }
    const cols = {
      totalQty: sql<string>`coalesce(sum(${mpPours.qtyLitres}), 0)`,
      amQty: sql<string>`coalesce(sum(${mpPours.qtyLitres}) filter (where ${mpPours.shift} = 'am'), 0)`,
      pmQty: sql<string>`coalesce(sum(${mpPours.qtyLitres}) filter (where ${mpPours.shift} = 'pm'), 0)`,
      pourCount: sql<number>`count(*)::int`,
      farmerCount: sql<number>`count(distinct ${mpPours.farmerId})::int`,
      avgFat: sql<string>`coalesce(round(avg(${mpPours.fat}), 2), 0)`,
      avgSnf: sql<string>`coalesce(round(avg(${mpPours.snf}), 2), 0)`,
      avgWater: sql<string>`coalesce(round(avg(${mpPours.water}), 2), 0)`,
      grossAmount: sql<string>`coalesce(sum(${mpPours.lineAmount}), 0)`,
    };
    // per-CC rollup: a pour is recorded at a VMCC whose parent is its CC, so we
    // group pours by that parent node. `vmcc`/`cc` are two aliases of mp_nodes.
    const vmcc = alias(mpNodes, 'pour_vmcc');
    const cc = alias(mpNodes, 'parent_cc');
    const [[r], typeRows, nodeRows, ccRows] = await Promise.all([
      this.db.select(cols).from(mpPours).where(and(...conds)),
      this.db.select({ milkType: mpPours.milkType, ...cols })
        .from(mpPours).where(and(...conds))
        .groupBy(mpPours.milkType)
        .orderBy(sql`sum(${mpPours.qtyLitres}) desc`),
      this.db.select({
        nodeId: mpPours.nodeId,
        nodeName: mpNodes.name,
        nodeCode: mpNodes.code,
        nodeType: mpNodes.nodeType,
        ...cols,
      })
        .from(mpPours)
        .innerJoin(mpNodes, eq(mpNodes.id, mpPours.nodeId))
        .where(and(...conds))
        .groupBy(mpPours.nodeId, mpNodes.name, mpNodes.code, mpNodes.nodeType)
        .orderBy(sql`sum(${mpPours.qtyLitres}) desc`),
      this.db.select({
        nodeId: cc.id,
        nodeName: cc.name,
        nodeCode: cc.code,
        nodeType: cc.nodeType,
        ...cols,
      })
        .from(mpPours)
        .innerJoin(vmcc, eq(vmcc.id, mpPours.nodeId))
        .innerJoin(cc, eq(cc.id, vmcc.parentNodeId))
        .where(and(...conds))
        .groupBy(cc.id, cc.name, cc.code, cc.nodeType)
        .orderBy(sql`sum(${mpPours.qtyLitres}) desc`),
    ]);
    return {
      from: q.from, to: q.to, nodeId: q.nodeId ?? null,
      totalQty: Number(r?.totalQty ?? 0),
      amQty: Number(r?.amQty ?? 0),
      pmQty: Number(r?.pmQty ?? 0),
      pourCount: r?.pourCount ?? 0,
      farmerCount: r?.farmerCount ?? 0,
      avgFat: Number(r?.avgFat ?? 0),
      avgSnf: Number(r?.avgSnf ?? 0),
      avgWater: Number(r?.avgWater ?? 0),
      grossAmount: Number(r?.grossAmount ?? 0),
      byMilkType: typeRows.map((t) => ({
        milkType: t.milkType,
        totalQty: Number(t.totalQty ?? 0),
        amQty: Number(t.amQty ?? 0),
        pmQty: Number(t.pmQty ?? 0),
        pourCount: t.pourCount ?? 0,
        farmerCount: t.farmerCount ?? 0,
        avgFat: Number(t.avgFat ?? 0),
        avgSnf: Number(t.avgSnf ?? 0),
        avgWater: Number(t.avgWater ?? 0),
        grossAmount: Number(t.grossAmount ?? 0),
      })),
      byCc: ccRows.map(toNodeRow),
      byNode: nodeRows.map(toNodeRow),
    };
  }

  /** One qty-weighted rollup row per collection_date of received vmcc→cc
   * consignments at a CC node, newest day first. Powers the receive-history
   * day list without shipping every consignment row to the client. */
  async receivedDaily(q: ReceivedDailyQuery): Promise<ReceivedDay[]> {
    const wq = (col: AnyPgColumn) =>
      sql<string | null>`round(sum(${mpConsignments.receiptQty} * ${col}) / nullif(sum(${mpConsignments.receiptQty}) filter (where ${col} is not null), 0), 2)`;
    const rows = await this.db.select({
      date: mpConsignments.collectionDate,
      totalQty: sql<string>`coalesce(sum(${mpConsignments.receiptQty}), 0)`,
      vmccCount: sql<number>`count(distinct ${mpConsignments.fromNodeId})::int`,
      fat: wq(mpConsignments.receiptFat),
      snf: wq(mpConsignments.receiptSnf),
      water: wq(mpConsignments.receiptWater),
    }).from(mpConsignments).where(and(
      eq(mpConsignments.tenantId, this.tenantId),
      eq(mpConsignments.toNodeId, q.nodeId),
      eq(mpConsignments.kind, 'vmcc_to_cc'),
      eq(mpConsignments.status, 'received'),
      gte(mpConsignments.collectionDate, q.from),
      lte(mpConsignments.collectionDate, q.to),
    )).groupBy(mpConsignments.collectionDate)
      .orderBy(sql`${mpConsignments.collectionDate} desc`);
    return rows.map((r) => ({
      date: r.date,
      totalQty: Number(r.totalQty ?? 0),
      vmccCount: r.vmccCount ?? 0,
      fat: numOrNull2(r.fat),
      snf: numOrNull2(r.snf),
      water: numOrNull2(r.water),
    }));
  }

  /** One qty-weighted QC rollup row per collection_date of recorded pours at a
   * node, newest day first — optionally scoped to a single farmer. Powers the
   * VMCC QC trend chart without shipping every pour to the client. */
  async poursDaily(q: PoursDailyQuery, principal?: MpPrincipal): Promise<PourDay[]> {
    const wq = (col: AnyPgColumn) =>
      sql<string | null>`round(sum(${mpPours.qtyLitres} * ${col}) / nullif(sum(${mpPours.qtyLitres}) filter (where ${col} is not null), 0), 2)`;
    const conds = [
      eq(mpPours.tenantId, this.tenantId), eq(mpPours.status, 'recorded'),
      eq(mpPours.nodeId, q.nodeId),
      gte(mpPours.collectionDate, q.from), lte(mpPours.collectionDate, q.to),
    ];
    if (q.farmerId) conds.push(eq(mpPours.farmerId, q.farmerId));
    if (principal) {
      const scope = scopePours(principal);
      if (scope) conds.push(scope);
    }
    const rows = await this.db.select({
      date: mpPours.collectionDate,
      totalQty: sql<string>`coalesce(sum(${mpPours.qtyLitres}), 0)`,
      farmerCount: sql<number>`count(distinct ${mpPours.farmerId})::int`,
      fat: wq(mpPours.fat),
      snf: wq(mpPours.snf),
      water: wq(mpPours.water),
    }).from(mpPours).where(and(...conds))
      .groupBy(mpPours.collectionDate)
      .orderBy(sql`${mpPours.collectionDate} desc`);
    return rows.map((r) => ({
      date: r.date,
      totalQty: Number(r.totalQty ?? 0),
      farmerCount: r.farmerCount ?? 0,
      fat: numOrNull2(r.fat),
      snf: numOrNull2(r.snf),
      water: numOrNull2(r.water),
    }));
  }

  /** Per-(date, milk type) qty-weighted QC rollup across the tenant, optionally
   * one node — one series per milk type for the trend charts, oldest day first
   * so the client can plot left-to-right. */
  async qualityTrend(q: QualityTrendQuery, principal?: MpPrincipal): Promise<QualityTrendRow[]> {
    const wq = (col: AnyPgColumn) =>
      sql<string | null>`round(sum(${mpPours.qtyLitres} * ${col}) / nullif(sum(${mpPours.qtyLitres}) filter (where ${col} is not null), 0), 2)`;
    const conds = [
      eq(mpPours.tenantId, this.tenantId), eq(mpPours.status, 'recorded'),
      gte(mpPours.collectionDate, q.from), lte(mpPours.collectionDate, q.to),
    ];
    if (q.nodeId) conds.push(eq(mpPours.nodeId, q.nodeId));
    if (principal) {
      const scope = scopePours(principal);
      if (scope) conds.push(scope);
    }
    const rows = await this.db.select({
      date: mpPours.collectionDate,
      milkType: mpPours.milkType,
      totalQty: sql<string>`coalesce(sum(${mpPours.qtyLitres}), 0)`,
      fat: wq(mpPours.fat),
      snf: wq(mpPours.snf),
      water: wq(mpPours.water),
    }).from(mpPours).where(and(...conds))
      .groupBy(mpPours.collectionDate, mpPours.milkType)
      .orderBy(sql`${mpPours.collectionDate} asc`);
    return rows.map((r) => ({
      date: r.date,
      milkType: r.milkType,
      totalQty: Number(r.totalQty ?? 0),
      fat: numOrNull2(r.fat),
      snf: numOrNull2(r.snf),
      water: numOrNull2(r.water),
    }));
  }

  /** Per-(date, milk type) full collection rollup across the tenant (optionally
   * one node), newest day first — one series per milk type for the history view.
   * Uses the same plain-average QC as the home "By milk type — today" table. */
  async milkTypeDaily(q: QualityTrendQuery, principal?: MpPrincipal): Promise<MilkTypeDayRow[]> {
    const conds = [
      eq(mpPours.tenantId, this.tenantId), eq(mpPours.status, 'recorded'),
      gte(mpPours.collectionDate, q.from), lte(mpPours.collectionDate, q.to),
    ];
    if (q.nodeId) conds.push(eq(mpPours.nodeId, q.nodeId));
    if (principal) {
      const scope = scopePours(principal);
      if (scope) conds.push(scope);
    }
    const rows = await this.db.select({
      date: mpPours.collectionDate,
      milkType: mpPours.milkType,
      ...rollupCols(),
    }).from(mpPours).where(and(...conds))
      .groupBy(mpPours.collectionDate, mpPours.milkType)
      .orderBy(sql`${mpPours.collectionDate} desc`);
    return rows.map((r) => ({ date: r.date, milkType: r.milkType, ...numRollup(r) }));
  }

  /** Per-(date, node) full collection rollup, newest day first — grouped either
   * on the pour's own VMCC or rolled up to its parent CC. The client picks a node
   * from a dropdown; both dimensions can carry many nodes, so all are returned. */
  async nodeDaily(q: NodeDailyQuery, principal?: MpPrincipal): Promise<NodeDayRow[]> {
    const conds = [
      eq(mpPours.tenantId, this.tenantId), eq(mpPours.status, 'recorded'),
      gte(mpPours.collectionDate, q.from), lte(mpPours.collectionDate, q.to),
    ];
    if (principal) {
      const scope = scopePours(principal);
      if (scope) conds.push(scope);
    }
    const cols = rollupCols();
    // per-CC: roll pours up to the VMCC's parent CC (two aliases of mp_nodes).
    const vmcc = alias(mpNodes, 'pour_vmcc');
    const cc = alias(mpNodes, 'parent_cc');
    const rows = q.groupBy === 'cc'
      ? await this.db.select({ date: mpPours.collectionDate, nodeId: cc.id, nodeName: cc.name, nodeCode: cc.code, ...cols })
          .from(mpPours)
          .innerJoin(vmcc, eq(vmcc.id, mpPours.nodeId))
          .innerJoin(cc, eq(cc.id, vmcc.parentNodeId))
          .where(and(...conds))
          .groupBy(cc.id, cc.name, cc.code, mpPours.collectionDate)
          .orderBy(sql`${mpPours.collectionDate} desc`)
      : await this.db.select({ date: mpPours.collectionDate, nodeId: mpNodes.id, nodeName: mpNodes.name, nodeCode: mpNodes.code, ...cols })
          .from(mpPours)
          .innerJoin(mpNodes, eq(mpNodes.id, mpPours.nodeId))
          .where(and(...conds))
          .groupBy(mpNodes.id, mpNodes.name, mpNodes.code, mpPours.collectionDate)
          .orderBy(sql`${mpPours.collectionDate} desc`);
    return rows.map((r) => ({ date: r.date, nodeId: r.nodeId, nodeName: r.nodeName, nodeCode: r.nodeCode, ...numRollup(r) }));
  }

  /** Whole-network snapshot for one day: collected/dispatched/received per node
   * plus every from→to leg with its measured loss. Two aggregations (pours +
   * consignments); the hierarchy and per-hop shrinkage are composed on the
   * client from these rows. Owner/accountant/viewer only — operators use their
   * node dashboards. */
  async flow(q: FlowReportQuery): Promise<FlowReport> {
    const shift = q.shift ?? null;
    const pourConds = [
      eq(mpPours.tenantId, this.tenantId), eq(mpPours.status, 'recorded'),
      eq(mpPours.collectionDate, q.date),
    ];
    if (shift) pourConds.push(eq(mpPours.shift, shift));
    const pourRows = await this.db.select({
      nodeId: mpPours.nodeId,
      collected: sql<string>`coalesce(sum(${mpPours.qtyLitres}), 0)`,
    }).from(mpPours).where(and(...pourConds)).groupBy(mpPours.nodeId);

    const consConds = [
      eq(mpConsignments.tenantId, this.tenantId),
      eq(mpConsignments.collectionDate, q.date),
      ne(mpConsignments.status, 'reversed'),
    ];
    if (shift) consConds.push(eq(mpConsignments.shift, shift));
    const edgeRows = await this.db.select({
      fromNodeId: mpConsignments.fromNodeId,
      toNodeId: mpConsignments.toNodeId,
      kind: mpConsignments.kind,
      dispatchedQty: sql<string>`coalesce(sum(${mpConsignments.dispatchQty}), 0)`,
      receivedQty: sql<string>`coalesce(sum(${mpConsignments.receiptQty}), 0)`,
    }).from(mpConsignments).where(and(...consConds))
      .groupBy(mpConsignments.fromNodeId, mpConsignments.toNodeId, mpConsignments.kind);

    return assembleFlow(q.date, shift, pourRows as PourAgg[], edgeRows as EdgeAgg[]);
  }
}

/** Fold the two aggregations into per-node + per-edge rows with derived
 * on-hand, per-hop loss %, and network totals. Pure — no DB. */
function assembleFlow(
  date: string, shift: 'am' | 'pm' | null, pourRows: PourAgg[], edgeRows: EdgeAgg[],
): FlowReport {
  const nodes = new Map<string, FlowNode>();
  const ensure = (id: string): FlowNode => {
    let n = nodes.get(id);
    if (!n) { n = { nodeId: id, collected: 0, dispatchedOut: 0, receivedIn: 0, onHand: 0 }; nodes.set(id, n); }
    return n;
  };
  for (const p of pourRows) ensure(p.nodeId).collected = Number(p.collected);

  const edges: FlowEdge[] = [];
  let dispatched = 0, received = 0, receivedAtPlant = 0, measuredLoss = 0;
  for (const e of edgeRows) {
    const d = Number(e.dispatchedQty), r = Number(e.receivedQty);
    const loss = r > 0 ? d - r : 0; // loss is only meaningful once received
    ensure(e.fromNodeId).dispatchedOut += d;
    ensure(e.toNodeId).receivedIn += r;
    dispatched += d; received += r; measuredLoss += loss;
    if (e.kind === 'cc_to_pp') receivedAtPlant += r;
    edges.push({
      fromNodeId: e.fromNodeId, toNodeId: e.toNodeId, kind: e.kind,
      dispatchedQty: d, receivedQty: r, measuredLoss: loss,
      variancePct: r > 0 && d > 0 ? Number((((d - r) / d) * 100).toFixed(2)) : null,
    });
  }

  let collected = 0;
  for (const n of nodes.values()) {
    n.onHand = n.collected + n.receivedIn - n.dispatchedOut;
    collected += n.collected;
  }
  return {
    date, shift, nodes: [...nodes.values()], edges,
    totals: { collected, dispatched, received, receivedAtPlant, measuredLoss },
  };
}

function numOrNull2(v: string | null | undefined): number | null {
  return v == null ? null : Number(v);
}

/** The plain-average QC + qty/count aggregate columns shared by the daily
 * history rollups (matches the home "By … — today" tables). */
function rollupCols() {
  return {
    totalQty: sql<string>`coalesce(sum(${mpPours.qtyLitres}), 0)`,
    amQty: sql<string>`coalesce(sum(${mpPours.qtyLitres}) filter (where ${mpPours.shift} = 'am'), 0)`,
    pmQty: sql<string>`coalesce(sum(${mpPours.qtyLitres}) filter (where ${mpPours.shift} = 'pm'), 0)`,
    pourCount: sql<number>`count(*)::int`,
    farmerCount: sql<number>`count(distinct ${mpPours.farmerId})::int`,
    avgFat: sql<string>`coalesce(round(avg(${mpPours.fat}), 2), 0)`,
    avgSnf: sql<string>`coalesce(round(avg(${mpPours.snf}), 2), 0)`,
    avgWater: sql<string>`coalesce(round(avg(${mpPours.water}), 2), 0)`,
    grossAmount: sql<string>`coalesce(sum(${mpPours.lineAmount}), 0)`,
  };
}

/** Coerce a raw rollupCols() row (numeric strings) into a typed DayRollup. */
function numRollup(r: {
  totalQty: string; amQty: string; pmQty: string; pourCount: number; farmerCount: number;
  avgFat: string; avgSnf: string; avgWater: string; grossAmount: string;
}): DayRollup {
  return {
    totalQty: Number(r.totalQty ?? 0),
    amQty: Number(r.amQty ?? 0),
    pmQty: Number(r.pmQty ?? 0),
    pourCount: r.pourCount ?? 0,
    farmerCount: r.farmerCount ?? 0,
    avgFat: Number(r.avgFat ?? 0),
    avgSnf: Number(r.avgSnf ?? 0),
    avgWater: Number(r.avgWater ?? 0),
    grossAmount: Number(r.grossAmount ?? 0),
  };
}

/** Shared shaper for the per-VMCC and per-CC collection rollup rows. */
function toNodeRow(n: {
  nodeId: string; nodeName: string; nodeCode: string; nodeType: string;
  totalQty: string; amQty: string; pmQty: string; pourCount: number; farmerCount: number;
  avgFat: string; avgSnf: string; avgWater: string; grossAmount: string;
}): CollectionNodeRow {
  return {
    nodeId: n.nodeId,
    nodeName: n.nodeName,
    nodeCode: n.nodeCode,
    nodeType: n.nodeType,
    totalQty: Number(n.totalQty ?? 0),
    amQty: Number(n.amQty ?? 0),
    pmQty: Number(n.pmQty ?? 0),
    pourCount: n.pourCount ?? 0,
    farmerCount: n.farmerCount ?? 0,
    avgFat: Number(n.avgFat ?? 0),
    avgSnf: Number(n.avgSnf ?? 0),
    avgWater: Number(n.avgWater ?? 0),
    grossAmount: Number(n.grossAmount ?? 0),
  };
}
