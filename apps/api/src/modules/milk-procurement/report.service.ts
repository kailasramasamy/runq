import { and, eq, ne, or, sql, gte, lte } from 'drizzle-orm';
import { alias, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { mpPours, mpConsignments, mpNodes } from '@runq/db';
import type { Db } from '@runq/db';
import type {
  CollectionReportQuery, ReceivedDailyQuery, PoursDailyQuery, FlowReportQuery,
  QualityTrendQuery, NodeDailyQuery,
} from '@runq/validators';
import { MpPrincipal, scopePours, scopeConsignments } from './access-scope';

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

  /** Home dashboard rollup. Milk reaches the tenant two ways: farmer-level pours
   * logged at a VMCC, and manual "direct receive" at a CC (its VMCCs never log a
   * pour — the CC just records what arrived). We roll up both and merge, so a
   * pourless direct-receive network still shows its litres/AM-PM/QC. Farmer,
   * pour-count and gross-payable stay pour-only (a direct receipt has none). */
  async collectionSummary(q: CollectionReportQuery, principal?: MpPrincipal): Promise<CollectionSummary> {
    const [pour, dr] = await Promise.all([
      this.pourSummary(q, principal),
      this.directReceiveSummary(q, principal),
    ]);
    const byQty = (a: CollectionNodeRow, b: CollectionNodeRow) => b.totalQty - a.totalQty;
    return {
      from: q.from, to: q.to, nodeId: q.nodeId ?? null,
      ...mergeRollup(pour.total, dr.total),
      byMilkType: mergeKeyed(pour.byMilkType, dr.byMilkType, (r) => r.milkType)
        .sort((a, b) => b.totalQty - a.totalQty),
      byCc: mergeKeyed(pour.byCc, dr.byCc, (r) => r.nodeId).sort(byQty),
      byNode: mergeKeyed(pour.byNode, dr.byNode, (r) => r.nodeId).sort(byQty),
    };
  }

  /** Pour-side of the collection rollup: total + per-milk-type + per-VMCC + per-CC
   * (pours rolled up to the VMCC's parent CC). */
  private async pourSummary(q: CollectionReportQuery, principal?: MpPrincipal) {
    const conds = [
      eq(mpPours.tenantId, this.tenantId), eq(mpPours.status, 'recorded'),
      gte(mpPours.collectionDate, q.from), lte(mpPours.collectionDate, q.to),
    ];
    if (q.nodeId) conds.push(eq(mpPours.nodeId, q.nodeId));
    if (principal) {
      const scope = scopePours(principal);
      if (scope) conds.push(scope);
    }
    const cols = rollupCols();
    // per-CC rollup: a pour is recorded at a VMCC whose parent is its CC, so we
    // group pours by that parent node. `vmcc`/`cc` are two aliases of mp_nodes.
    const vmcc = alias(mpNodes, 'pour_vmcc');
    const cc = alias(mpNodes, 'parent_cc');
    const [[r], typeRows, nodeRows, ccRows] = await Promise.all([
      this.db.select(cols).from(mpPours).where(and(...conds)),
      this.db.select({ milkType: mpPours.milkType, ...cols })
        .from(mpPours).where(and(...conds)).groupBy(mpPours.milkType),
      this.db.select({
        nodeId: mpPours.nodeId, nodeName: mpNodes.name, nodeCode: mpNodes.code, nodeType: mpNodes.nodeType, ...cols,
      })
        .from(mpPours).innerJoin(mpNodes, eq(mpNodes.id, mpPours.nodeId)).where(and(...conds))
        .groupBy(mpPours.nodeId, mpNodes.name, mpNodes.code, mpNodes.nodeType),
      this.db.select({
        nodeId: cc.id, nodeName: cc.name, nodeCode: cc.code, nodeType: cc.nodeType, ...cols,
      })
        .from(mpPours).innerJoin(vmcc, eq(vmcc.id, mpPours.nodeId)).innerJoin(cc, eq(cc.id, vmcc.parentNodeId))
        .where(and(...conds)).groupBy(cc.id, cc.name, cc.code, cc.nodeType),
    ]);
    return {
      total: r ? numRollup(r) : ZERO_ROLLUP,
      byMilkType: typeRows.map((t) => ({ milkType: t.milkType, ...numRollup(t) })),
      byNode: nodeRows.map(toNodeRow),
      byCc: ccRows.map(toNodeRow),
    };
  }

  /** Direct-receive side: manual CC receipts (no matching VMCC pour), rolled up
   * per milk type, per source VMCC (byNode) and per receiving CC (byCc). */
  private async directReceiveSummary(q: CollectionReportQuery, principal?: MpPrincipal) {
    const conds = this.drBaseConds(q.from, q.to, q.nodeId, principal);
    const cols = drRollupCols();
    const fromN = alias(mpNodes, 'dr_from');
    const toN = alias(mpNodes, 'dr_to');
    const [[r], typeRows, nodeRows, ccRows] = await Promise.all([
      this.db.select(cols).from(mpConsignments).where(and(...conds)),
      this.db.select({ milkType: drMilkType, ...cols })
        .from(mpConsignments).where(and(...conds)).groupBy(drMilkType),
      this.db.select({
        nodeId: mpConsignments.fromNodeId, nodeName: fromN.name, nodeCode: fromN.code, nodeType: fromN.nodeType, ...cols,
      })
        .from(mpConsignments).innerJoin(fromN, eq(fromN.id, mpConsignments.fromNodeId)).where(and(...conds))
        .groupBy(mpConsignments.fromNodeId, fromN.name, fromN.code, fromN.nodeType),
      this.db.select({
        nodeId: mpConsignments.toNodeId, nodeName: toN.name, nodeCode: toN.code, nodeType: toN.nodeType, ...cols,
      })
        .from(mpConsignments).innerJoin(toN, eq(toN.id, mpConsignments.toNodeId)).where(and(...conds))
        .groupBy(mpConsignments.toNodeId, toN.name, toN.code, toN.nodeType),
    ]);
    return {
      total: r ? numRollup(r) : ZERO_ROLLUP,
      byMilkType: typeRows.map((t) => ({ milkType: t.milkType, ...numRollup(t) })),
      byNode: nodeRows.map(toNodeRow),
      byCc: ccRows.map(toNodeRow),
    };
  }

  /** WHERE for received manual (direct-receive) VMCC→CC consignments in a window,
   * optionally touching one node (as source or destination) and scoped by role. */
  private drBaseConds(from: string, to: string, nodeId: string | undefined, principal?: MpPrincipal) {
    const conds = [
      eq(mpConsignments.tenantId, this.tenantId), eq(mpConsignments.kind, 'vmcc_to_cc'),
      eq(mpConsignments.directReceive, true), eq(mpConsignments.status, 'received'),
      gte(mpConsignments.collectionDate, from), lte(mpConsignments.collectionDate, to),
    ];
    if (nodeId) conds.push(or(eq(mpConsignments.fromNodeId, nodeId), eq(mpConsignments.toNodeId, nodeId))!);
    if (principal) {
      const scope = scopeConsignments(principal);
      if (scope) conds.push(scope);
    }
    return conds;
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
    const drwq = (col: AnyPgColumn) =>
      sql<string | null>`round(sum(${mpConsignments.receiptQty} * ${col}) / nullif(sum(${mpConsignments.receiptQty}) filter (where ${col} is not null), 0), 2)`;
    const drConds = this.drBaseConds(q.from, q.to, q.nodeId, principal);
    const [pourRows, drRows] = await Promise.all([
      this.db.select({
        date: mpPours.collectionDate, milkType: mpPours.milkType,
        totalQty: sql<string>`coalesce(sum(${mpPours.qtyLitres}), 0)`,
        fat: wq(mpPours.fat), snf: wq(mpPours.snf), water: wq(mpPours.water),
      }).from(mpPours).where(and(...conds)).groupBy(mpPours.collectionDate, mpPours.milkType),
      this.db.select({
        date: mpConsignments.collectionDate, milkType: drMilkType,
        totalQty: sql<string>`coalesce(sum(${mpConsignments.receiptQty}), 0)`,
        fat: drwq(mpConsignments.receiptFat), snf: drwq(mpConsignments.receiptSnf), water: drwq(mpConsignments.receiptWater),
      }).from(mpConsignments).where(and(...drConds)).groupBy(mpConsignments.collectionDate, drMilkType),
    ]);
    const shape = (r: { date: string; milkType: string; totalQty: string; fat: string | null; snf: string | null; water: string | null }): QualityTrendRow =>
      ({ date: r.date, milkType: r.milkType, totalQty: Number(r.totalQty ?? 0), fat: numOrNull2(r.fat), snf: numOrNull2(r.snf), water: numOrNull2(r.water) });
    return mergeQc(pourRows.map(shape), drRows.map(shape));
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
    const drConds = this.drBaseConds(q.from, q.to, q.nodeId, principal);
    const [pourRows, drRows] = await Promise.all([
      this.db.select({ date: mpPours.collectionDate, milkType: mpPours.milkType, ...rollupCols() })
        .from(mpPours).where(and(...conds)).groupBy(mpPours.collectionDate, mpPours.milkType),
      this.db.select({ date: mpConsignments.collectionDate, milkType: drMilkType, ...drRollupCols() })
        .from(mpConsignments).where(and(...drConds)).groupBy(mpConsignments.collectionDate, drMilkType),
    ]);
    const pour = pourRows.map((r) => ({ date: r.date, milkType: r.milkType, ...numRollup(r) }));
    const dr = drRows.map((r) => ({ date: r.date, milkType: r.milkType, ...numRollup(r) }));
    return mergeKeyed(pour, dr, (r) => `${r.date}|${r.milkType}`).sort(byDateDesc);
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
    // Direct-receive milk groups on the receiving CC (byCc) or the source VMCC
    // (byNode) — the same node the pour rollup keys on for each grouping.
    const drConds = this.drBaseConds(q.from, q.to, undefined, principal);
    const drNode = alias(mpNodes, 'dr_node');
    const drCol = q.groupBy === 'cc' ? mpConsignments.toNodeId : mpConsignments.fromNodeId;
    const [pourRows, drRows] = await Promise.all([
      q.groupBy === 'cc'
        ? this.db.select({ date: mpPours.collectionDate, nodeId: cc.id, nodeName: cc.name, nodeCode: cc.code, ...cols })
            .from(mpPours)
            .innerJoin(vmcc, eq(vmcc.id, mpPours.nodeId))
            .innerJoin(cc, eq(cc.id, vmcc.parentNodeId))
            .where(and(...conds))
            .groupBy(cc.id, cc.name, cc.code, mpPours.collectionDate)
        : this.db.select({ date: mpPours.collectionDate, nodeId: mpNodes.id, nodeName: mpNodes.name, nodeCode: mpNodes.code, ...cols })
            .from(mpPours)
            .innerJoin(mpNodes, eq(mpNodes.id, mpPours.nodeId))
            .where(and(...conds))
            .groupBy(mpNodes.id, mpNodes.name, mpNodes.code, mpPours.collectionDate),
      this.db.select({ date: mpConsignments.collectionDate, nodeId: drCol, nodeName: drNode.name, nodeCode: drNode.code, ...drRollupCols() })
        .from(mpConsignments).innerJoin(drNode, eq(drNode.id, drCol)).where(and(...drConds))
        .groupBy(drCol, drNode.name, drNode.code, mpConsignments.collectionDate),
    ]);
    const shape = (r: typeof pourRows[number] | typeof drRows[number]) =>
      ({ date: r.date, nodeId: r.nodeId, nodeName: r.nodeName, nodeCode: r.nodeCode, ...numRollup(r) });
    return mergeKeyed(pourRows.map(shape), drRows.map(shape), (r) => `${r.date}|${r.nodeId}`).sort(byDateDesc);
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

/** Direct-receive counterpart of rollupCols(): qty-weighted QC over CC receipts,
 * with zeroed pour/farmer/gross (a manual receipt logs no farmer-level pours).
 * Same column shape as rollupCols() so the rows merge cleanly. */
function drRollupCols() {
  const wq = (col: AnyPgColumn) =>
    sql<string>`coalesce(round(sum(${mpConsignments.receiptQty} * ${col}) / nullif(sum(${mpConsignments.receiptQty}) filter (where ${col} is not null), 0), 2), 0)`;
  return {
    totalQty: sql<string>`coalesce(sum(${mpConsignments.receiptQty}), 0)`,
    // A whole-day (null-shift) receipt counts as AM, mirroring shiftFrom(null).
    amQty: sql<string>`coalesce(sum(${mpConsignments.receiptQty}) filter (where ${mpConsignments.shift} = 'am' or ${mpConsignments.shift} is null), 0)`,
    pmQty: sql<string>`coalesce(sum(${mpConsignments.receiptQty}) filter (where ${mpConsignments.shift} = 'pm'), 0)`,
    pourCount: sql<number>`0`,
    farmerCount: sql<number>`0`,
    avgFat: wq(mpConsignments.receiptFat),
    avgSnf: wq(mpConsignments.receiptSnf),
    avgWater: wq(mpConsignments.receiptWater),
    grossAmount: sql<string>`'0'`,
  };
}

const ZERO_ROLLUP: DayRollup = {
  totalQty: 0, amQty: 0, pmQty: 0, pourCount: 0, farmerCount: 0,
  avgFat: 0, avgSnf: 0, avgWater: 0, grossAmount: 0,
};

/** A manual receipt often records no milk type, so fall back to the source
 * VMCC's configured default (its whole tanker is that type), and only to
 * 'mixed' when the VMCC has none — all existing types, so the client's
 * label/series need no change. */
const drMilkType = sql<string>`coalesce(${mpConsignments.milkType}, (select ${mpNodes.defaultMilkType} from ${mpNodes} where ${mpNodes.id} = ${mpConsignments.fromNodeId}), 'mixed')`;

/** Merge pour and direct-receive QC series by (date, milk type): sum litres and
 * qty-weight FAT/SNF/Water, dropping a side with no sample. Oldest day first. */
function mergeQc(pour: QualityTrendRow[], dr: QualityTrendRow[]): QualityTrendRow[] {
  const m = new Map<string, QualityTrendRow>();
  const key = (r: QualityTrendRow) => `${r.date}|${r.milkType}`;
  for (const r of pour) m.set(key(r), r);
  for (const r of dr) {
    const a = m.get(key(r));
    m.set(key(r), a ? blendQc(a, r) : r);
  }
  return [...m.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function blendQc(a: QualityTrendRow, b: QualityTrendRow): QualityTrendRow {
  const wq = (ax: number | null, bx: number | null) => {
    const aw = ax != null ? a.totalQty : 0, bw = bx != null ? b.totalQty : 0;
    const w = aw + bw;
    return w > 0 ? Number((((ax ?? 0) * aw + (bx ?? 0) * bw) / w).toFixed(2)) : null;
  };
  return {
    date: a.date, milkType: a.milkType, totalQty: a.totalQty + b.totalQty,
    fat: wq(a.fat, b.fat), snf: wq(a.snf, b.snf), water: wq(a.water, b.water),
  };
}

/** Newest-day-first comparator for the daily history rollups. */
const byDateDesc = (a: { date: string }, b: { date: string }) => b.date.localeCompare(a.date);

/** Fold a pour rollup and a direct-receive rollup for the same key: sum the
 * additive fields and qty-weight the QC. A 0 average means "no sample", so that
 * side is dropped from the blend instead of dragging QC toward zero. */
function mergeRollup(a: DayRollup, b: DayRollup): DayRollup {
  const blend = (av: number, bv: number) => {
    const aw = av > 0 ? a.totalQty : 0, bw = bv > 0 ? b.totalQty : 0;
    const w = aw + bw;
    return w > 0 ? Number(((av * aw + bv * bw) / w).toFixed(2)) : 0;
  };
  return {
    totalQty: a.totalQty + b.totalQty,
    amQty: a.amQty + b.amQty,
    pmQty: a.pmQty + b.pmQty,
    pourCount: a.pourCount + b.pourCount,
    farmerCount: a.farmerCount + b.farmerCount,
    avgFat: blend(a.avgFat, b.avgFat),
    avgSnf: blend(a.avgSnf, b.avgSnf),
    avgWater: blend(a.avgWater, b.avgWater),
    grossAmount: a.grossAmount + b.grossAmount,
  };
}

/** Union pour rows with direct-receive rows by a shared key, folding matched
 * pairs via mergeRollup and keeping each row's non-rollup fields (name/date). */
function mergeKeyed<T extends DayRollup>(pour: T[], dr: T[], key: (r: T) => string): T[] {
  const m = new Map<string, T>();
  for (const r of pour) m.set(key(r), r);
  for (const r of dr) {
    const ex = m.get(key(r));
    m.set(key(r), ex ? { ...ex, ...mergeRollup(ex, r) } : r);
  }
  return [...m.values()];
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
