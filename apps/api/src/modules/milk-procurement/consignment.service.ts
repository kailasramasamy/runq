import { and, eq, desc, sql, inArray, gte, lte, or, isNull } from 'drizzle-orm';
import { mpConsignments, mpNodes, mpPours, mpGlSettings, mpRawMilkItems, stockLedger } from '@runq/db';
import type { Db, MpConsignmentRow } from '@runq/db';
import { applyPagination, calcTotalPages } from '@runq/db';
import type { PaginationMeta } from '@runq/types';
import type {
  CreateConsignmentInput, ReceiveConsignmentInput, ConsignmentFilter,
  DirectReceiveConsignmentInput,
} from '@runq/validators';
import { ConflictError, NotFoundError, ValidationError } from '../../utils/errors';
import { StockLedgerService } from '../inventory/stock-ledger.service';
import { nextDocNo } from './numbering';
import { isShiftClosed } from './shift-closure.queries';
import { ccReceiveWindow, type Slot } from './procurement-window';
import { MpPrincipal, scopeConsignments, assertNodeAccess } from './access-scope';
import { sendDirectReceiptWhatsApp, type ReceiptPricing } from './mp-consignment-notify';
import { RateChartService } from './rate-chart.service';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type MilkType = NonNullable<MpConsignmentRow['milkType']>;

/** Milk on hand at a source node on a date: what it took in minus what it already sent on. */
export interface ConsignmentAvailability {
  nodeId: string; collectionDate: string; nodeType: string;
  collected: number; dispatched: number; available: number;
  avgFat: number | null; avgSnf: number | null; avgWater: number | null;
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
    const [from] = await this.db.select({
      hasBmc: mpNodes.hasBmc, nodeType: mpNodes.nodeType, overnightPooling: mpNodes.overnightPooling,
    }).from(mpNodes).where(and(eq(mpNodes.tenantId, this.tenantId), eq(mpNodes.id, input.fromNodeId)));
    if (!from) throw new NotFoundError('Source node');
    const overnight = from.nodeType === 'cc' && from.overnightPooling;
    // An overnight CC pools its whole window (prev PM + today AM) and dispatches
    // as one shift-null tanker, exactly like a BMC node — so it never needs a
    // per-shift selection even when it has no BMC of its own.
    const pooled = from.hasBmc || overnight;
    if (!pooled && !input.shift) {
      throw new ValidationError('This node has no BMC — select a shift (AM/PM) to dispatch.');
    }
    const shift = pooled ? null : input.shift ?? null;
    // Hard gate: collection must be closed before milk leaves. An overnight CC's
    // pool spans yesterday-PM + today-AM; a BMC node pools the whole day (both
    // shifts); no-BMC needs just the one.
    const mustBeClosed: Slot[] = overnight
      ? ccReceiveWindow(true, input.collectionDate)
      : from.hasBmc
        ? [{ date: input.collectionDate, shift: 'am' }, { date: input.collectionDate, shift: 'pm' }]
        : [{ date: input.collectionDate, shift: input.shift! }];
    for (const s of mustBeClosed) {
      const closed = await isShiftClosed(this.db, {
        tenantId: this.tenantId, nodeId: input.fromNodeId, collectionDate: s.date, shift: s.shift,
      });
      if (!closed) {
        throw new ValidationError(overnight
          ? 'Close both pool slots (yesterday PM + today AM) before dispatching.'
          : 'Close collection for this shift before dispatching.');
      }
    }
    // Never let dispatches exceed what's on hand — otherwise availability goes
    // negative (e.g. dispatching an already-sent shift/pool).
    const available = overnight
      ? await this.ccPoolAvailable(input.fromNodeId, input.collectionDate)
      : await this.availableToDispatch(input.fromNodeId, input.collectionDate, from.nodeType, shift ?? undefined);
    if (input.dispatchQty - available > 1e-6) {
      const scope = shift ? `${shift.toUpperCase()} ` : '';
      throw new ValidationError(`Only ${available} L of ${scope}milk available to dispatch from this node.`);
    }
    const milkType = await this.deriveMilkType(this.db, input.fromNodeId, from.nodeType, input.collectionDate, shift);
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
        milkType,
        containerNo: input.containerNo ?? null,
        dispatchQty: String(input.dispatchQty),
        dispatchFat: numOrNull(input.dispatchFat),
        dispatchSnf: numOrNull(input.dispatchSnf),
        dispatchWater: numOrNull(input.dispatchWater),
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
    return this.db.transaction(async (tx) => {
      const [row] = await tx.update(mpConsignments).set({
        receiptQty: String(input.receiptQty),
        receiptFat: numOrNull(input.receiptFat),
        receiptSnf: numOrNull(input.receiptSnf),
        receiptWater: numOrNull(input.receiptWater),
        receivedAt: new Date(),
        receivedBy: userId ?? null,
        varianceQty: String(varianceQty),
        variancePct: String(variancePct),
        status: 'received',
        updatedAt: new Date(),
      }).where(and(eq(mpConsignments.tenantId, this.tenantId), eq(mpConsignments.id, id))).returning();
      // PP intake posts a raw-milk batch into stock_ledger (best-effort).
      const stockLedgerId = await this.postRawMilkReceipt(tx, row!, userId);
      return stockLedgerId ? { ...row!, stockLedgerId } : row!;
    });
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
    const [from] = await this.db.select({ nodeType: mpNodes.nodeType, hasBmc: mpNodes.hasBmc, defaultMilkType: mpNodes.defaultMilkType }).from(mpNodes)
      .where(and(eq(mpNodes.tenantId, this.tenantId), eq(mpNodes.id, input.fromNodeId)));
    if (!from) throw new NotFoundError('Source node');
    const kind = from.nodeType === 'cc' ? 'cc_to_pp' : 'vmcc_to_cc';
    const shift = from.hasBmc ? null : input.shift ?? null;
    const qty = String(input.qty);
    const milkType = await this.deriveMilkType(this.db, input.fromNodeId, from.nodeType, input.collectionDate, shift);
    const result = await this.db.transaction(async (tx) => {
      const no = await nextDocNo(tx, this.tenantId, 'consignment', input.collectionDate, 'CON');
      const [row] = await tx.insert(mpConsignments).values({
        tenantId: this.tenantId,
        consignmentNo: no,
        kind,
        fromNodeId: input.fromNodeId,
        toNodeId: input.toNodeId,
        collectionDate: input.collectionDate,
        shift,
        milkType,
        dispatchQty: qty,
        dispatchFat: numOrNull(input.fat),
        dispatchSnf: numOrNull(input.snf),
        dispatchWater: numOrNull(input.water),
        dispatchedAt: new Date(),
        dispatchedBy: userId ?? null,
        receiptQty: qty,
        receiptFat: numOrNull(input.fat),
        receiptSnf: numOrNull(input.snf),
        receiptWater: numOrNull(input.water),
        receivedAt: new Date(),
        receivedBy: userId ?? null,
        varianceQty: '0',
        variancePct: '0',
        directReceive: true,
        status: 'received',
      }).returning();
      const stockLedgerId = await this.postRawMilkReceipt(tx, row!, userId);
      return stockLedgerId ? { ...row!, stockLedgerId } : row!;
    });

    // Fire-and-forget: WhatsApp the source VMCC's operator that their milk was
    // received, valuing the receipt's QC via the rate chart. No-op for CC→PP
    // receipts and when Interakt/operator phone absent.
    const pricing = await this.priceReceipt(milkType ?? from.defaultMilkType, input, Number(qty));
    void sendDirectReceiptWhatsApp(this.db, this.tenantId, result, pricing)
      .catch((err) => console.error('manual receipt WhatsApp failed:', err));
    return result;
  }

  /** Value a manual receipt's QC with the source VMCC's rate chart (FAT/SNF —
   * receipts carry no CLR). Null when QC is missing or no chart resolves, so the
   * notice falls back to '-' rather than a misleading zero. */
  private async priceReceipt(
    milkType: MilkType | null, input: DirectReceiveConsignmentInput, qty: number,
  ): Promise<ReceiptPricing | null> {
    if (milkType == null || input.fat == null || input.snf == null) return null;
    const rates = new RateChartService(this.db, this.tenantId);
    const query = { milkType, fat: input.fat, snf: input.snf, scopeNodeId: input.fromNodeId, onDate: input.collectionDate };
    try {
      const { ratePerLitre, pricingMode } = await rates.resolveRate(query);
      // Flat VMCCs also carry the quality-based (matrix) rate for the nudge.
      const matrixRate = pricingMode === 'flat'
        ? (await rates.resolveMatrixReference(query))?.ratePerLitre ?? null
        : null;
      return { rate: ratePerLitre, total: round2(qty * ratePerLitre), matrixRate };
    } catch (e) {
      if (e instanceof NotFoundError) return null;
      throw e;
    }
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
    return this.db.transaction(async (tx) => {
      const [row] = await tx.update(mpConsignments).set({
        receiptQty: String(input.receiptQty),
        receiptFat: numOrNull(input.receiptFat),
        receiptSnf: numOrNull(input.receiptSnf),
        receiptWater: numOrNull(input.receiptWater),
        receivedAt: new Date(),
        receivedBy: userId ?? null,
        varianceQty: String(varianceQty),
        variancePct: String(variancePct),
        updatedAt: new Date(),
      }).where(and(eq(mpConsignments.tenantId, this.tenantId), eq(mpConsignments.id, id))).returning();
      // Keep posted stock in lockstep with the corrected receipt qty.
      const delta = round3(Number(input.receiptQty) - Number(c.receiptQty ?? 0));
      if (c.stockLedgerId && Math.abs(delta) > 1e-6) {
        await this.adjustRawMilkStock(tx, c.stockLedgerId, row!.id, delta, userId);
      }
      return row!;
    });
  }

  async reverse(id: string, principal: MpPrincipal): Promise<MpConsignmentRow> {
    const c = await this.getById(id, principal);
    return this.db.transaction(async (tx) => {
      const [row] = await tx.update(mpConsignments)
        .set({ status: 'reversed', updatedAt: new Date() })
        .where(and(eq(mpConsignments.tenantId, this.tenantId), eq(mpConsignments.id, id))).returning();
      // Back out the raw-milk batch posted on receipt.
      if (c.stockLedgerId) {
        await this.adjustRawMilkStock(tx, c.stockLedgerId, row!.id, -Number(c.receiptQty ?? 0), undefined);
      }
      return row!;
    });
  }

  /** Delete a manually-entered (directReceive) mis-entry. Only a manual receipt
   * that hasn't been locked for dispatch (its CC slot still open) can go —
   * a dispatched consignment would erase the source's dispatch, and onward
   * dispatch is itself gated on the close, so the close check covers both. */
  async deleteManualReceipt(id: string, principal: MpPrincipal): Promise<MpConsignmentRow> {
    const c = await this.getById(id, principal);
    assertNodeAccess(principal, c.toNodeId);
    if (!c.directReceive) throw new ConflictError('Only a manually-entered receipt can be deleted');
    if (c.status !== 'received') throw new ConflictError('Only a received receipt can be deleted');
    await this.assertReceiptUnlocked(c);
    return this.db.transaction(async (tx) => {
      const [row] = await tx.update(mpConsignments)
        .set({ status: 'reversed', updatedAt: new Date() })
        .where(and(eq(mpConsignments.tenantId, this.tenantId), eq(mpConsignments.id, id))).returning();
      if (c.stockLedgerId) {
        await this.adjustRawMilkStock(tx, c.stockLedgerId, row!.id, -Number(c.receiptQty ?? 0), undefined);
      }
      return row!;
    });
  }

  /** Reject if the destination CC's slot for this receipt is closed — a BMC CC
   * locks once the whole day is closed; a no-BMC CC once that shift is. */
  private async assertReceiptUnlocked(c: MpConsignmentRow): Promise<void> {
    const [to] = await this.db.select({ hasBmc: mpNodes.hasBmc }).from(mpNodes)
      .where(and(eq(mpNodes.tenantId, this.tenantId), eq(mpNodes.id, c.toNodeId)));
    const closed = (shift: 'am' | 'pm') => isShiftClosed(this.db,
      { tenantId: this.tenantId, nodeId: c.toNodeId, collectionDate: c.collectionDate, shift });
    if (to?.hasBmc) {
      if ((await closed('am')) && (await closed('pm'))) {
        throw new ConflictError('Receipt is locked — dispatch closed for the day');
      }
    } else if (c.shift && (await closed(c.shift))) {
      throw new ConflictError('Receipt is locked — dispatch closed for this shift');
    }
  }

  /** Available-to-dispatch at a node: VMCC counts its pours, CC/PP count milk received in.
   * When `shift` is given, every figure is scoped to that shift (no-BMC, per-shift dispatch). */
  async availability(nodeId: string, collectionDate: string, principal: MpPrincipal, shift?: 'am' | 'pm'): Promise<ConsignmentAvailability> {
    assertNodeAccess(principal, nodeId);
    const [node] = await this.db.select({ nodeType: mpNodes.nodeType, overnightPooling: mpNodes.overnightPooling })
      .from(mpNodes).where(and(eq(mpNodes.tenantId, this.tenantId), eq(mpNodes.id, nodeId)));
    if (!node) throw new NotFoundError('Node not found');
    const overnight = node.nodeType === 'cc' && node.overnightPooling;
    const src = node.nodeType === 'vmcc'
      ? await this.collectedFromPours(nodeId, collectionDate, shift)
      : overnight
        ? await this.collectedFromReceiptsWindow(nodeId, ccReceiveWindow(true, collectionDate))
        : await this.collectedFromReceipts(nodeId, collectionDate, shift);
    // An overnight pool is dispatched as one tanker dated today (shift null), so
    // the dispatched side stays anchored on today regardless of the shift filter.
    const dispatched = overnight
      ? await this.sumDispatched(nodeId, collectionDate)
      : await this.sumDispatched(nodeId, collectionDate, shift);
    return {
      nodeId, collectionDate, nodeType: node.nodeType,
      collected: src.qty, dispatched, available: round3(src.qty - dispatched),
      avgFat: src.fat, avgSnf: src.snf, avgWater: src.water,
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
      water: sql<string | null>`round(sum(${mpPours.qtyLitres} * ${mpPours.water}) / nullif(sum(${mpPours.qtyLitres}) filter (where ${mpPours.water} is not null), 0), 2)`,
    }).from(mpPours).where(and(eq(mpPours.tenantId, this.tenantId), eq(mpPours.nodeId, nodeId),
      eq(mpPours.collectionDate, date), eq(mpPours.status, 'recorded'),
      ...(shift ? [eq(mpPours.shift, shift)] : [])));
    return { qty: Number(r?.qty ?? 0), fat: numOrNull2(r?.fat), snf: numOrNull2(r?.snf), water: numOrNull2(r?.water) };
  }

  /** Qty + volume-weighted FAT/SNF of milk received in at a CC/PP. */
  private async collectedFromReceipts(nodeId: string, date: string, shift?: 'am' | 'pm'): Promise<SourceAgg> {
    const [r] = await this.db.select({
      qty: sql<string>`coalesce(sum(${mpConsignments.receiptQty}), 0)`,
      fat: sql<string | null>`round(sum(${mpConsignments.receiptQty} * ${mpConsignments.receiptFat}) / nullif(sum(${mpConsignments.receiptQty}) filter (where ${mpConsignments.receiptFat} is not null), 0), 2)`,
      snf: sql<string | null>`round(sum(${mpConsignments.receiptQty} * ${mpConsignments.receiptSnf}) / nullif(sum(${mpConsignments.receiptQty}) filter (where ${mpConsignments.receiptSnf} is not null), 0), 2)`,
      water: sql<string | null>`round(sum(${mpConsignments.receiptQty} * ${mpConsignments.receiptWater}) / nullif(sum(${mpConsignments.receiptQty}) filter (where ${mpConsignments.receiptWater} is not null), 0), 2)`,
    }).from(mpConsignments).where(and(eq(mpConsignments.tenantId, this.tenantId), eq(mpConsignments.toNodeId, nodeId),
      eq(mpConsignments.collectionDate, date), eq(mpConsignments.status, 'received'),
      ...(shift ? [eq(mpConsignments.shift, shift)] : [])));
    return { qty: Number(r?.qty ?? 0), fat: numOrNull2(r?.fat), snf: numOrNull2(r?.snf), water: numOrNull2(r?.water) };
  }

  /** Qty + weighted QC of milk received in over an explicit set of (date, shift)
   * slots — an overnight CC's pool spans two calendar days. */
  private async collectedFromReceiptsWindow(nodeId: string, slots: Slot[]): Promise<SourceAgg> {
    // A whole-day (null-shift) consignment maps to the AM slot, mirroring the
    // app's shiftFrom(null) === 'am'. Without this, milk from BMC VMCCs — which
    // dispatch whole-day with shift null — is dropped from an overnight CC's
    // pool, so "ready for plant" undercounts vs the pooled total shown on home.
    const slotCond = or(...slots.map((s) =>
      and(
        eq(mpConsignments.collectionDate, s.date),
        s.shift === 'am'
          ? or(eq(mpConsignments.shift, 'am'), isNull(mpConsignments.shift))
          : eq(mpConsignments.shift, s.shift),
      )));
    const [r] = await this.db.select({
      qty: sql<string>`coalesce(sum(${mpConsignments.receiptQty}), 0)`,
      fat: sql<string | null>`round(sum(${mpConsignments.receiptQty} * ${mpConsignments.receiptFat}) / nullif(sum(${mpConsignments.receiptQty}) filter (where ${mpConsignments.receiptFat} is not null), 0), 2)`,
      snf: sql<string | null>`round(sum(${mpConsignments.receiptQty} * ${mpConsignments.receiptSnf}) / nullif(sum(${mpConsignments.receiptQty}) filter (where ${mpConsignments.receiptSnf} is not null), 0), 2)`,
      water: sql<string | null>`round(sum(${mpConsignments.receiptQty} * ${mpConsignments.receiptWater}) / nullif(sum(${mpConsignments.receiptQty}) filter (where ${mpConsignments.receiptWater} is not null), 0), 2)`,
    }).from(mpConsignments).where(and(eq(mpConsignments.tenantId, this.tenantId),
      eq(mpConsignments.toNodeId, nodeId), eq(mpConsignments.status, 'received'), slotCond));
    return { qty: Number(r?.qty ?? 0), fat: numOrNull2(r?.fat), snf: numOrNull2(r?.snf), water: numOrNull2(r?.water) };
  }

  /** Litres on hand for an overnight CC's pool (windowed receipts − today's dispatch). */
  private async ccPoolAvailable(nodeId: string, anchorDate: string): Promise<number> {
    const src = await this.collectedFromReceiptsWindow(nodeId, ccReceiveWindow(true, anchorDate));
    const dispatched = await this.sumDispatched(nodeId, anchorDate);
    return round3(src.qty - dispatched);
  }

  private async sumDispatched(nodeId: string, date: string, shift?: 'am' | 'pm'): Promise<number> {
    const [r] = await this.db.select({ q: sql<string>`coalesce(sum(${mpConsignments.dispatchQty}), 0)` }).from(mpConsignments)
      .where(and(eq(mpConsignments.tenantId, this.tenantId), eq(mpConsignments.fromNodeId, nodeId),
        eq(mpConsignments.collectionDate, date), inArray(mpConsignments.status, ['in_transit', 'received']),
        ...(shift ? [eq(mpConsignments.shift, shift)] : [])));
    return Number(r?.q ?? 0);
  }

  /** Single milk type of the source's real composition for the day/shift, or
   *  null when mixed — drives which raw-milk item a PP receipt posts to. */
  private async deriveMilkType(
    db: Db | Tx, fromNodeId: string, fromNodeType: string,
    date: string, shift: 'am' | 'pm' | null,
  ): Promise<MilkType | null> {
    if (fromNodeType === 'vmcc') {
      const rows = await db.selectDistinct({ t: mpPours.milkType }).from(mpPours)
        .where(and(eq(mpPours.tenantId, this.tenantId), eq(mpPours.nodeId, fromNodeId),
          eq(mpPours.collectionDate, date), eq(mpPours.status, 'recorded'),
          ...(shift ? [eq(mpPours.shift, shift)] : [])));
      return rows.length === 1 ? rows[0]!.t : null;
    }
    // CC source: the milk it received in (VMCC→CC consignments) that day.
    const rows = await db.selectDistinct({ t: mpConsignments.milkType }).from(mpConsignments)
      .where(and(eq(mpConsignments.tenantId, this.tenantId), eq(mpConsignments.toNodeId, fromNodeId),
        eq(mpConsignments.collectionDate, date), eq(mpConsignments.status, 'received')));
    return rows.length === 1 ? (rows[0]!.t ?? null) : null;
  }

  /** PP intake → raw-milk stock_ledger batch. Best-effort: needs the warehouse +
   *  a milk-type item mapped, else skipped. Valued at zero — real valuation + GL
   *  arrive with P1.1 at payout lock. Returns the ledger id or null. */
  private async postRawMilkReceipt(
    tx: Tx, c: MpConsignmentRow, userId: string | undefined,
  ): Promise<string | null> {
    const qty = Number(c.receiptQty ?? 0);
    if (qty <= 0) return null;
    const [toNode] = await tx.select({ nodeType: mpNodes.nodeType }).from(mpNodes)
      .where(and(eq(mpNodes.tenantId, this.tenantId), eq(mpNodes.id, c.toNodeId)));
    if (toNode?.nodeType !== 'pp') return null; // only PP intake hits raw-milk stock
    const [settings] = await tx.select({ wh: mpGlSettings.rawMilkWarehouseId }).from(mpGlSettings)
      .where(eq(mpGlSettings.tenantId, this.tenantId));
    if (!settings?.wh) return null;
    const [map] = await tx.select({ itemId: mpRawMilkItems.itemId }).from(mpRawMilkItems)
      .where(and(eq(mpRawMilkItems.tenantId, this.tenantId),
        eq(mpRawMilkItems.milkType, c.milkType ?? 'mixed')));
    if (!map) return null;
    const { ledgerId } = await new StockLedgerService(this.tenantId).recordMovement(tx, {
      itemId: map.itemId, warehouseId: settings.wh, batchNo: c.consignmentNo,
      movementType: 'grn', sourceType: 'mp_receipt', sourceId: c.id,
      qtyDelta: qty, unitCost: 0, movedAt: new Date(`${c.collectionDate}T00:00:00Z`),
      postedBy: userId ?? null,
    });
    await tx.update(mpConsignments).set({ stockLedgerId: ledgerId, updatedAt: new Date() })
      .where(and(eq(mpConsignments.tenantId, this.tenantId), eq(mpConsignments.id, c.id)));
    return ledgerId;
  }

  /** Follow-on movement against an already-posted raw-milk batch (receipt
   *  correction or reversal), mirroring the original item/warehouse/batch. */
  private async adjustRawMilkStock(
    tx: Tx, stockLedgerId: string, sourceId: string, qtyDelta: number, userId: string | undefined,
  ): Promise<void> {
    if (Math.abs(qtyDelta) <= 1e-6) return;
    const [orig] = await tx.select({
      itemId: stockLedger.itemId, warehouseId: stockLedger.warehouseId, batchNo: stockLedger.batchNo,
    }).from(stockLedger).where(and(eq(stockLedger.tenantId, this.tenantId), eq(stockLedger.id, stockLedgerId)));
    if (!orig) return;
    await new StockLedgerService(this.tenantId).recordMovement(tx, {
      itemId: orig.itemId, warehouseId: orig.warehouseId, batchNo: orig.batchNo,
      movementType: qtyDelta > 0 ? 'adjustment_in' : 'adjustment_out',
      sourceType: 'mp_receipt_adjustment', sourceId, qtyDelta, unitCost: 0,
      movedAt: new Date(), postedBy: userId ?? null,
    });
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

interface SourceAgg { qty: number; fat: number | null; snf: number | null; water: number | null }

function numOrNull(v: number | null | undefined): string | null {
  return v != null ? String(v) : null;
}

function numOrNull2(v: string | null | undefined): number | null {
  return v == null ? null : Number(v);
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
