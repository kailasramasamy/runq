import { and, eq, desc, sql, inArray, gte, lte } from 'drizzle-orm';
import { mpConsignments, mpNodes, mpPours } from '@runq/db';
import type { Db, MpConsignmentRow } from '@runq/db';
import { applyPagination, calcTotalPages } from '@runq/db';
import type { PaginationMeta } from '@runq/types';
import type {
  CreateConsignmentInput, ReceiveConsignmentInput, ConsignmentFilter,
} from '@runq/validators';
import { ConflictError, NotFoundError } from '../../utils/errors';
import { nextDocNo } from './numbering';
import { MpPrincipal, scopeConsignments, assertNodeAccess } from './access-scope';

/** Milk on hand at a source node on a date: what it took in minus what it already sent on. */
export interface ConsignmentAvailability {
  nodeId: string; collectionDate: string; nodeType: string;
  collected: number; dispatched: number; available: number;
  avgFat: number | null; avgSnf: number | null;
}

/** Tier-to-tier consignments (VMCC→CC, CC→PP) with dispatch+receipt QC + variance. */
export class ConsignmentService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async list(
    filters: ConsignmentFilter,
    pagination: { page: number; limit: number },
    principal: MpPrincipal,
  ): Promise<{ data: MpConsignmentRow[]; meta: PaginationMeta }> {
    const { page, limit } = pagination;
    const { offset } = applyPagination(page, limit);
    const where = this.buildWhere(filters, principal);
    const [rows, countResult] = await Promise.all([
      this.db.select().from(mpConsignments).where(where)
        .orderBy(desc(mpConsignments.collectionDate), desc(mpConsignments.createdAt)).limit(limit).offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(mpConsignments).where(where),
    ]);
    const total = countResult[0]?.count ?? 0;
    return { data: rows, meta: { page, limit, total, totalPages: calcTotalPages(total, limit) } };
  }

  async getById(id: string, principal: MpPrincipal): Promise<MpConsignmentRow> {
    const [row] = await this.db.select().from(mpConsignments)
      .where(and(eq(mpConsignments.tenantId, this.tenantId), eq(mpConsignments.id, id), scopeConsignments(principal)));
    if (!row) throw new NotFoundError('Consignment not found');
    return row;
  }

  async dispatch(input: CreateConsignmentInput, userId: string | undefined, principal: MpPrincipal): Promise<MpConsignmentRow> {
    // operators may only dispatch from a node they're assigned to
    assertNodeAccess(principal, input.fromNodeId);
    return this.db.transaction(async (tx) => {
      const no = await nextDocNo(tx, this.tenantId, 'consignment', input.collectionDate, 'CON');
      const [row] = await tx.insert(mpConsignments).values({
        tenantId: this.tenantId,
        consignmentNo: no,
        kind: input.kind,
        fromNodeId: input.fromNodeId,
        toNodeId: input.toNodeId,
        collectionDate: input.collectionDate,
        shift: input.shift ?? null,
        containerNo: input.containerNo ?? null,
        dispatchQty: String(input.dispatchQty),
        dispatchFat: numOrNull(input.dispatchFat),
        dispatchSnf: numOrNull(input.dispatchSnf),
        dispatchedAt: new Date(),
        dispatchedBy: userId ?? null,
        status: 'in_transit',
      }).returning();
      return row!;
    });
  }

  async receive(id: string, input: ReceiveConsignmentInput, userId: string | undefined, principal: MpPrincipal): Promise<MpConsignmentRow> {
    const c = await this.getById(id, principal);
    if (c.status !== 'in_transit') throw new ConflictError('Consignment is not in transit');
    // operators may only receive at a node they're assigned to
    assertNodeAccess(principal, c.toNodeId);
    const dispatched = Number(c.dispatchQty ?? 0);
    const varianceQty = round3(Number(input.receiptQty) - dispatched);
    const variancePct = dispatched > 0 ? round3((varianceQty / dispatched) * 100) : 0;
    // NOTE: PP raw-milk → stock_ledger posting deferred until the inventory
    // item/warehouse mapping is decided (tracker A4 / schema-spec §9.4).
    const [row] = await this.db.update(mpConsignments).set({
      receiptQty: String(input.receiptQty),
      receiptFat: numOrNull(input.receiptFat),
      receiptSnf: numOrNull(input.receiptSnf),
      receivedAt: new Date(),
      receivedBy: userId ?? null,
      varianceQty: String(varianceQty),
      variancePct: String(variancePct),
      status: 'received',
      updatedAt: new Date(),
    }).where(and(eq(mpConsignments.tenantId, this.tenantId), eq(mpConsignments.id, id))).returning();
    return row!;
  }

  async reverse(id: string, principal: MpPrincipal): Promise<MpConsignmentRow> {
    await this.getById(id, principal);
    const [row] = await this.db.update(mpConsignments)
      .set({ status: 'reversed', updatedAt: new Date() })
      .where(and(eq(mpConsignments.tenantId, this.tenantId), eq(mpConsignments.id, id))).returning();
    return row!;
  }

  /** Available-to-dispatch at a node: VMCC counts its pours, CC/PP count milk received in. */
  async availability(nodeId: string, collectionDate: string, principal: MpPrincipal): Promise<ConsignmentAvailability> {
    assertNodeAccess(principal, nodeId);
    const [node] = await this.db.select({ nodeType: mpNodes.nodeType }).from(mpNodes)
      .where(and(eq(mpNodes.tenantId, this.tenantId), eq(mpNodes.id, nodeId)));
    if (!node) throw new NotFoundError('Node not found');
    const src = node.nodeType === 'vmcc'
      ? await this.collectedFromPours(nodeId, collectionDate)
      : await this.collectedFromReceipts(nodeId, collectionDate);
    const dispatched = await this.sumDispatched(nodeId, collectionDate);
    return {
      nodeId, collectionDate, nodeType: node.nodeType,
      collected: src.qty, dispatched, available: round3(src.qty - dispatched),
      avgFat: src.fat, avgSnf: src.snf,
    };
  }

  /** Qty + volume-weighted FAT/SNF of recorded pours at a VMCC. */
  private async collectedFromPours(nodeId: string, date: string): Promise<SourceAgg> {
    const [r] = await this.db.select({
      qty: sql<string>`coalesce(sum(${mpPours.qtyLitres}), 0)`,
      fat: sql<string | null>`round(sum(${mpPours.qtyLitres} * ${mpPours.fat}) / nullif(sum(${mpPours.qtyLitres}) filter (where ${mpPours.fat} is not null), 0), 2)`,
      snf: sql<string | null>`round(sum(${mpPours.qtyLitres} * ${mpPours.snf}) / nullif(sum(${mpPours.qtyLitres}) filter (where ${mpPours.snf} is not null), 0), 2)`,
    }).from(mpPours).where(and(eq(mpPours.tenantId, this.tenantId), eq(mpPours.nodeId, nodeId),
      eq(mpPours.collectionDate, date), eq(mpPours.status, 'recorded')));
    return { qty: Number(r?.qty ?? 0), fat: numOrNull2(r?.fat), snf: numOrNull2(r?.snf) };
  }

  /** Qty + volume-weighted FAT/SNF of milk received in at a CC/PP. */
  private async collectedFromReceipts(nodeId: string, date: string): Promise<SourceAgg> {
    const [r] = await this.db.select({
      qty: sql<string>`coalesce(sum(${mpConsignments.receiptQty}), 0)`,
      fat: sql<string | null>`round(sum(${mpConsignments.receiptQty} * ${mpConsignments.receiptFat}) / nullif(sum(${mpConsignments.receiptQty}) filter (where ${mpConsignments.receiptFat} is not null), 0), 2)`,
      snf: sql<string | null>`round(sum(${mpConsignments.receiptQty} * ${mpConsignments.receiptSnf}) / nullif(sum(${mpConsignments.receiptQty}) filter (where ${mpConsignments.receiptSnf} is not null), 0), 2)`,
    }).from(mpConsignments).where(and(eq(mpConsignments.tenantId, this.tenantId), eq(mpConsignments.toNodeId, nodeId),
      eq(mpConsignments.collectionDate, date), eq(mpConsignments.status, 'received')));
    return { qty: Number(r?.qty ?? 0), fat: numOrNull2(r?.fat), snf: numOrNull2(r?.snf) };
  }

  private async sumDispatched(nodeId: string, date: string): Promise<number> {
    const [r] = await this.db.select({ q: sql<string>`coalesce(sum(${mpConsignments.dispatchQty}), 0)` }).from(mpConsignments)
      .where(and(eq(mpConsignments.tenantId, this.tenantId), eq(mpConsignments.fromNodeId, nodeId),
        eq(mpConsignments.collectionDate, date), inArray(mpConsignments.status, ['in_transit', 'received'])));
    return Number(r?.q ?? 0);
  }

  private buildWhere(filters: ConsignmentFilter, principal: MpPrincipal) {
    const conds = [eq(mpConsignments.tenantId, this.tenantId)];
    if (filters.kind) conds.push(eq(mpConsignments.kind, filters.kind));
    if (filters.fromNodeId) conds.push(eq(mpConsignments.fromNodeId, filters.fromNodeId));
    if (filters.toNodeId) conds.push(eq(mpConsignments.toNodeId, filters.toNodeId));
    if (filters.collectionDate) conds.push(eq(mpConsignments.collectionDate, filters.collectionDate));
    if (filters.from) conds.push(gte(mpConsignments.collectionDate, filters.from));
    if (filters.to) conds.push(lte(mpConsignments.collectionDate, filters.to));
    if (filters.status) conds.push(eq(mpConsignments.status, filters.status));
    const scope = scopeConsignments(principal);
    if (scope) conds.push(scope);
    return and(...conds);
  }
}

interface SourceAgg { qty: number; fat: number | null; snf: number | null }

function numOrNull(v: number | null | undefined): string | null {
  return v != null ? String(v) : null;
}

function numOrNull2(v: string | null | undefined): number | null {
  return v == null ? null : Number(v);
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
