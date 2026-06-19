import { and, eq, desc, sql, inArray, gte, lte } from 'drizzle-orm';
import { mpConsignments, mpNodes, mpPours } from '@runq/db';
import type { Db, MpConsignmentRow } from '@runq/db';
import { applyPagination, calcTotalPages } from '@runq/db';
import type { PaginationMeta } from '@runq/types';
import type {
  CreateConsignmentInput, ReceiveConsignmentInput, ConsignmentFilter,
  DirectReceiveConsignmentInput,
} from '@runq/validators';
import { ConflictError, NotFoundError, ValidationError } from '../../utils/errors';
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
    // BMC nodes pool the whole day (shift null); no-BMC nodes dispatch each shift
    // separately, so shift is required and scopes the consignment.
    const [from] = await this.db.select({ hasBmc: mpNodes.hasBmc, nodeType: mpNodes.nodeType }).from(mpNodes)
      .where(and(eq(mpNodes.tenantId, this.tenantId), eq(mpNodes.id, input.fromNodeId)));
    if (!from) throw new NotFoundError('Source node');
    if (!from.hasBmc && !input.shift) {
      throw new ValidationError('This node has no BMC — select a shift (AM/PM) to dispatch.');
    }
    const shift = from.hasBmc ? null : input.shift ?? null;
    // Never let dispatches exceed what's on hand for this node/date/shift —
    // otherwise availability goes negative (e.g. dispatching an already-sent shift).
    const available = await this.availableToDispatch(input.fromNodeId, input.collectionDate, from.nodeType, shift ?? undefined);
    if (input.dispatchQty - available > 1e-6) {
      const scope = shift ? `${shift.toUpperCase()} ` : '';
      throw new ValidationError(`Only ${available} L of ${scope}milk available to dispatch from this node.`);
    }
    return this.db.transaction(async (tx) => {
      const no = await nextDocNo(tx, this.tenantId, 'consignment', input.collectionDate, 'CON');
      const [row] = await tx.insert(mpConsignments).values({
        tenantId: this.tenantId,
        consignmentNo: no,
        kind: input.kind,
        fromNodeId: input.fromNodeId,
        toNodeId: input.toNodeId,
        collectionDate: input.collectionDate,
        shift,
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

  /**
   * Ad-hoc receive: milk physically arrived without a dispatch record (the VMCC
   * operator forgot to mark dispatch, or doesn't use the app at all). The CC/PP
   * picks the source node, enters qty + FAT/SNF, and it's recorded already
   * 'received'. No source-availability check — the milk isn't in the system, so
   * there's nothing to check against. Dispatch figures mirror the receipt
   * (variance 0) so it behaves like a normal received consignment downstream.
   */
  async directReceive(
    input: DirectReceiveConsignmentInput, userId: string | undefined, principal: MpPrincipal,
  ): Promise<MpConsignmentRow> {
    assertNodeAccess(principal, input.toNodeId);
    assertNodeAccess(principal, input.fromNodeId);
    const [from] = await this.db.select({ nodeType: mpNodes.nodeType, hasBmc: mpNodes.hasBmc }).from(mpNodes)
      .where(and(eq(mpNodes.tenantId, this.tenantId), eq(mpNodes.id, input.fromNodeId)));
    if (!from) throw new NotFoundError('Source node');
    const kind = from.nodeType === 'cc' ? 'cc_to_pp' : 'vmcc_to_cc';
    const shift = from.hasBmc ? null : input.shift ?? null;
    const qty = String(input.qty);
    return this.db.transaction(async (tx) => {
      const no = await nextDocNo(tx, this.tenantId, 'consignment', input.collectionDate, 'CON');
      const [row] = await tx.insert(mpConsignments).values({
        tenantId: this.tenantId,
        consignmentNo: no,
        kind,
        fromNodeId: input.fromNodeId,
        toNodeId: input.toNodeId,
        collectionDate: input.collectionDate,
        shift,
        dispatchQty: qty,
        dispatchFat: numOrNull(input.fat),
        dispatchSnf: numOrNull(input.snf),
        dispatchedAt: new Date(),
        dispatchedBy: userId ?? null,
        receiptQty: qty,
        receiptFat: numOrNull(input.fat),
        receiptSnf: numOrNull(input.snf),
        receivedAt: new Date(),
        receivedBy: userId ?? null,
        varianceQty: '0',
        variancePct: '0',
        status: 'received',
      }).returning();
      return row!;
    });
  }

  /** Correct an already-received consignment's receipt figures (fix a just-made
   * entry). Recomputes variance. Only valid while status is 'received'. */
  async editReceipt(
    id: string, input: ReceiveConsignmentInput, userId: string | undefined, principal: MpPrincipal,
  ): Promise<MpConsignmentRow> {
    const c = await this.getById(id, principal);
    if (c.status !== 'received') throw new ConflictError('Only a received consignment can be corrected');
    assertNodeAccess(principal, c.toNodeId);
    const dispatched = Number(c.dispatchQty ?? 0);
    const varianceQty = round3(Number(input.receiptQty) - dispatched);
    const variancePct = dispatched > 0 ? round3((varianceQty / dispatched) * 100) : 0;
    const [row] = await this.db.update(mpConsignments).set({
      receiptQty: String(input.receiptQty),
      receiptFat: numOrNull(input.receiptFat),
      receiptSnf: numOrNull(input.receiptSnf),
      receivedAt: new Date(),
      receivedBy: userId ?? null,
      varianceQty: String(varianceQty),
      variancePct: String(variancePct),
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

  /** Available-to-dispatch at a node: VMCC counts its pours, CC/PP count milk received in.
   * When `shift` is given, every figure is scoped to that shift (no-BMC, per-shift dispatch). */
  async availability(nodeId: string, collectionDate: string, principal: MpPrincipal, shift?: 'am' | 'pm'): Promise<ConsignmentAvailability> {
    assertNodeAccess(principal, nodeId);
    const [node] = await this.db.select({ nodeType: mpNodes.nodeType }).from(mpNodes)
      .where(and(eq(mpNodes.tenantId, this.tenantId), eq(mpNodes.id, nodeId)));
    if (!node) throw new NotFoundError('Node not found');
    const src = node.nodeType === 'vmcc'
      ? await this.collectedFromPours(nodeId, collectionDate, shift)
      : await this.collectedFromReceipts(nodeId, collectionDate, shift);
    const dispatched = await this.sumDispatched(nodeId, collectionDate, shift);
    return {
      nodeId, collectionDate, nodeType: node.nodeType,
      collected: src.qty, dispatched, available: round3(src.qty - dispatched),
      avgFat: src.fat, avgSnf: src.snf,
    };
  }

  /** Litres still on hand to dispatch at a node for a date/shift (collected − dispatched). */
  private async availableToDispatch(nodeId: string, date: string, nodeType: string, shift?: 'am' | 'pm'): Promise<number> {
    const src = nodeType === 'vmcc'
      ? await this.collectedFromPours(nodeId, date, shift)
      : await this.collectedFromReceipts(nodeId, date, shift);
    const dispatched = await this.sumDispatched(nodeId, date, shift);
    return round3(src.qty - dispatched);
  }

  /** Qty + volume-weighted FAT/SNF of recorded pours at a VMCC. */
  private async collectedFromPours(nodeId: string, date: string, shift?: 'am' | 'pm'): Promise<SourceAgg> {
    const [r] = await this.db.select({
      qty: sql<string>`coalesce(sum(${mpPours.qtyLitres}), 0)`,
      fat: sql<string | null>`round(sum(${mpPours.qtyLitres} * ${mpPours.fat}) / nullif(sum(${mpPours.qtyLitres}) filter (where ${mpPours.fat} is not null), 0), 2)`,
      snf: sql<string | null>`round(sum(${mpPours.qtyLitres} * ${mpPours.snf}) / nullif(sum(${mpPours.qtyLitres}) filter (where ${mpPours.snf} is not null), 0), 2)`,
    }).from(mpPours).where(and(eq(mpPours.tenantId, this.tenantId), eq(mpPours.nodeId, nodeId),
      eq(mpPours.collectionDate, date), eq(mpPours.status, 'recorded'),
      ...(shift ? [eq(mpPours.shift, shift)] : [])));
    return { qty: Number(r?.qty ?? 0), fat: numOrNull2(r?.fat), snf: numOrNull2(r?.snf) };
  }

  /** Qty + volume-weighted FAT/SNF of milk received in at a CC/PP. */
  private async collectedFromReceipts(nodeId: string, date: string, shift?: 'am' | 'pm'): Promise<SourceAgg> {
    const [r] = await this.db.select({
      qty: sql<string>`coalesce(sum(${mpConsignments.receiptQty}), 0)`,
      fat: sql<string | null>`round(sum(${mpConsignments.receiptQty} * ${mpConsignments.receiptFat}) / nullif(sum(${mpConsignments.receiptQty}) filter (where ${mpConsignments.receiptFat} is not null), 0), 2)`,
      snf: sql<string | null>`round(sum(${mpConsignments.receiptQty} * ${mpConsignments.receiptSnf}) / nullif(sum(${mpConsignments.receiptQty}) filter (where ${mpConsignments.receiptSnf} is not null), 0), 2)`,
    }).from(mpConsignments).where(and(eq(mpConsignments.tenantId, this.tenantId), eq(mpConsignments.toNodeId, nodeId),
      eq(mpConsignments.collectionDate, date), eq(mpConsignments.status, 'received'),
      ...(shift ? [eq(mpConsignments.shift, shift)] : [])));
    return { qty: Number(r?.qty ?? 0), fat: numOrNull2(r?.fat), snf: numOrNull2(r?.snf) };
  }

  private async sumDispatched(nodeId: string, date: string, shift?: 'am' | 'pm'): Promise<number> {
    const [r] = await this.db.select({ q: sql<string>`coalesce(sum(${mpConsignments.dispatchQty}), 0)` }).from(mpConsignments)
      .where(and(eq(mpConsignments.tenantId, this.tenantId), eq(mpConsignments.fromNodeId, nodeId),
        eq(mpConsignments.collectionDate, date), inArray(mpConsignments.status, ['in_transit', 'received']),
        ...(shift ? [eq(mpConsignments.shift, shift)] : [])));
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
    if (filters.shift) conds.push(eq(mpConsignments.shift, filters.shift));
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
