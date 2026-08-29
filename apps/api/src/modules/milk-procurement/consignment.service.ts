import { and, asc, eq, desc, sql, inArray, gte, lte, or, isNull } from 'drizzle-orm';
import {
  mpConsignments, mpNodes, mpPours, mpFarmerSales, mpGlSettings, mpRawMilkItems, stockLedger,
} from '@runq/db';
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
import {
  ccReceiveWindow, poolSlots, isPooled, type Slot, type DispatchMode,
} from './procurement-window';
import { MpPrincipal, scopeConsignments, assertNodeAccess } from './access-scope';
import { sendDirectReceiptWhatsApp, type ReceiptPricing } from './mp-consignment-notify';
import { MpNotifier } from './mp-notifier';
import { RateChartService } from './rate-chart.service';
import { RawMilkCostService } from './raw-milk-cost';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type MilkType = NonNullable<MpConsignmentRow['milkType']>;

/** Per-leg switches. `silent` suppresses the dispatch/receipt notification —
 * the single-site fast track performs both halves of a leg on behalf of the one
 * operator who tapped, so pinging them six times about milk that never left the
 * building is noise, not news. */
export interface LegOptions { silent?: boolean }

/** Milk on hand at a source node on a date: what it took in minus what it already sent on. */
export interface ConsignmentAvailability {
  nodeId: string; collectionDate: string; nodeType: string;
  collected: number; dispatched: number; available: number;
  /** Litres handed to trader-farmers at the gate — off the slot, but not sent onward. */
  sold: number;
  avgFat: number | null; avgSnf: number | null; avgWater: number | null;
  /** One entry per milk type held at the node, so cow and buffalo are dispatched
   * as separate consignments rather than blended into one untyped tanker. */
  byMilkType: MilkTypeAvailability[];
}

export interface MilkTypeAvailability {
  milkType: MilkType | null;
  collected: number; dispatched: number; sold: number; available: number;
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

  async dispatch(
    input: CreateConsignmentInput, userId: string | undefined, principal: MpPrincipal,
    opts: LegOptions = {},
  ): Promise<MpConsignmentRow> {
    // operators may only dispatch from a node they're assigned to
    assertNodeAccess(principal, input.fromNodeId);
    // The node's dispatch mode decides everything below: a pooled node (day /
    // overnight) sends one untagged tanker, a per_shift node tags each
    // consignment with its shift and needs the caller to name it.
    const [from] = await this.db.select({
      nodeType: mpNodes.nodeType, dispatchMode: mpNodes.dispatchMode,
    }).from(mpNodes).where(and(eq(mpNodes.tenantId, this.tenantId), eq(mpNodes.id, input.fromNodeId)));
    if (!from) throw new NotFoundError('Source node');
    const mode = from.dispatchMode;
    const pooled = isPooled(mode);
    if (!pooled && !input.shift) {
      throw new ValidationError('This node dispatches per shift — select AM or PM.');
    }
    const shift = pooled ? null : input.shift ?? null;
    // Hard gate: collection must be closed before milk leaves. Same slot list the
    // close path writes, so the two can't disagree about what a pool contains.
    const mustBeClosed: Slot[] = poolSlots(mode, input.collectionDate, input.shift ?? undefined);
    for (const s of mustBeClosed) {
      const closed = await isShiftClosed(this.db, {
        tenantId: this.tenantId, nodeId: input.fromNodeId, collectionDate: s.date, shift: s.shift,
      });
      if (!closed) {
        throw new ValidationError(mode === 'overnight'
          ? 'Close both pool slots (yesterday PM + today AM) before dispatching.'
          : mode === 'day'
            ? 'Close both shifts (AM + PM) before dispatching.'
            : 'Close collection for this shift before dispatching.');
      }
    }
    // One consignment carries one milk type, so the type survives to the plant's
    // raw-milk stock. A caller that names none gets the derived type, and a source
    // holding more than one is refused rather than blended into an untyped tanker.
    const milkType = input.milkType
      ?? await this.deriveMilkType(this.db, input.fromNodeId, from.nodeType, input.collectionDate, shift);
    if (!milkType) {
      throw new ValidationError(
        'This milk is more than one type — dispatch each type as its own consignment.');
    }
    // Never let dispatches exceed what's on hand — otherwise availability goes
    // negative (e.g. dispatching an already-sent shift/pool). Scoped to the type,
    // so cow litres can't be sent against buffalo stock.
    const available = mode === 'overnight'
      ? await this.overnightPoolAvailable(
        input.fromNodeId, from.nodeType, input.collectionDate, milkType)
      : await this.availableToDispatch(
        input.fromNodeId, input.collectionDate, from.nodeType, shift ?? undefined, milkType);
    if (input.dispatchQty - available > 1e-6) {
      const scope = shift ? `${shift.toUpperCase()} ` : '';
      throw new ValidationError(
        `Only ${available} L of ${scope}${milkType} milk available to dispatch from this node.`);
    }
    const created = await this.db.transaction(async (tx) => {
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
    // Tell the destination's operators a load is on the way. Fire-and-forget:
    // a notification must never fail the dispatch that triggered it.
    if (!opts.silent) {
      void new MpNotifier(this.db, this.tenantId).dispatched(created)
        .catch((err) => console.error('mp dispatch notification failed:', err));
    }
    return created;
  }

  async receive(
    id: string, input: ReceiveConsignmentInput, userId: string | undefined, principal: MpPrincipal,
    opts: LegOptions = {},
  ): Promise<MpConsignmentRow> {
    const c = await this.getById(id, principal);
    if (c.status !== 'in_transit') throw new ConflictError('Consignment is not in transit');
    // operators may only receive at a node they're assigned to
    assertNodeAccess(principal, c.toNodeId);
    const dispatched = Number(c.dispatchQty ?? 0);
    const varianceQty = round3(Number(input.receiptQty) - dispatched);
    const variancePct = dispatched > 0 ? round3((varianceQty / dispatched) * 100) : 0;
    const result = await this.db.transaction(async (tx) => {
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
    // Close the loop back to the sender — a short delivery should reach the
    // dispatching operator's phone, not wait for a month-end report.
    if (!opts.silent) {
      void new MpNotifier(this.db, this.tenantId).received(result)
        .catch((err) => console.error('mp receipt notification failed:', err));
    }
    return result;
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
    const [from] = await this.db.select({
      nodeType: mpNodes.nodeType, dispatchMode: mpNodes.dispatchMode,
      defaultMilkType: mpNodes.defaultMilkType, allowedMilkTypes: mpNodes.allowedMilkTypes,
    }).from(mpNodes)
      .where(and(eq(mpNodes.tenantId, this.tenantId), eq(mpNodes.id, input.fromNodeId)));
    if (!from) throw new NotFoundError('Source node');
    const kind = from.nodeType === 'cc' ? 'cc_to_pp' : 'vmcc_to_cc';
    // Match how the source dispatches: a pooled source's milk is untagged, so a
    // manual receipt claiming a shift would sit outside the pool it belongs to.
    const shift = isPooled(from.dispatchMode) ? null : input.shift ?? null;
    const qty = String(input.qty);
    const [to] = await this.db.select({ nodeType: mpNodes.nodeType }).from(mpNodes)
      .where(and(eq(mpNodes.tenantId, this.tenantId), eq(mpNodes.id, input.toNodeId)));
    if (!to) throw new NotFoundError('Destination node');
    // A PP receipt becomes a raw-milk batch that manufacturing draws on, so its
    // type must be stated, never guessed. The usual reason for a manual receipt
    // here is that the CC hasn't entered its VMCC data yet — so deriving from
    // what the CC received returns nothing, and the fallbacks below would stamp
    // the plant's intake with the CC's default type. Cow milk manufactured as
    // buffalo is worse than a rejected entry.
    if (to.nodeType === 'pp' && !input.milkType) {
      throw new ValidationError(
        'Select the milk type — the plant tracks raw-milk stock per type.');
    }
    // A manual receipt is entered for a VMCC that doesn't use the app, so there
    // are no pours to derive from. Fall back to the centre's configuration: a
    // node allowed exactly one milk type can only have sent that one. Without
    // this the leg stays untyped and posts nothing to raw-milk stock.
    const soleAllowed = from.allowedMilkTypes?.length === 1 ? from.allowedMilkTypes[0]! : null;
    const milkType = input.milkType
      ?? await this.deriveMilkType(this.db, input.fromNodeId, from.nodeType, input.collectionDate, shift)
      ?? soleAllowed
      ?? from.defaultMilkType;
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
    try {
      const { ratePerLitre } = await new RateChartService(this.db, this.tenantId).resolveRate({
        milkType, fat: input.fat, snf: input.snf, scopeNodeId: input.fromNodeId, onDate: input.collectionDate,
      });
      return { rate: ratePerLitre, total: round2(qty * ratePerLitre) };
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
    await this.assertBatchUnconsumed(c);
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

  /** Reject if manufacturing has already drawn on the raw-milk batch this
   * receipt posted. A PP has no shift closure to lock the receipt, so this is
   * the gate there: undoing a consumed batch would drive its stock negative and
   * leave a production run standing on milk the ledger says never arrived.
   * Our own edit-receipt adjustments are not consumption, so they're excluded. */
  private async assertBatchUnconsumed(c: MpConsignmentRow): Promise<void> {
    if (!c.stockLedgerId) return;
    const [orig] = await this.db.select({
      itemId: stockLedger.itemId, warehouseId: stockLedger.warehouseId, batchNo: stockLedger.batchNo,
    }).from(stockLedger)
      .where(and(eq(stockLedger.tenantId, this.tenantId), eq(stockLedger.id, c.stockLedgerId)));
    if (!orig?.batchNo) return;
    const [drawn] = await this.db.select({ sourceType: stockLedger.sourceType }).from(stockLedger)
      .where(and(
        eq(stockLedger.tenantId, this.tenantId),
        eq(stockLedger.itemId, orig.itemId),
        eq(stockLedger.warehouseId, orig.warehouseId),
        eq(stockLedger.batchNo, orig.batchNo),
        sql`${stockLedger.qtyOut} > 0`,
        sql`not (${stockLedger.sourceType} = 'mp_receipt_adjustment' and ${stockLedger.sourceId} = ${c.id})`,
      )).limit(1);
    if (!drawn) return;
    // An inventory zero-out draws the batch down the same way production does,
    // and undoing the receipt would push it negative just as surely — but
    // saying "used in production" would send the user hunting a work order
    // that does not exist.
    throw new ConflictError(
      drawn.sourceType === 'inventory_adjustment' || drawn.sourceType === 'inventory_stock_take'
        ? 'This batch was cleared by an inventory adjustment — reverse that adjustment first.'
        : 'This milk has already been used in production — correct the quantity instead of deleting.');
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
  async availability(
    nodeId: string, collectionDate: string, principal: MpPrincipal,
    shift?: 'am' | 'pm', milkType?: MilkType,
  ): Promise<ConsignmentAvailability> {
    assertNodeAccess(principal, nodeId);
    const [node] = await this.db.select({ nodeType: mpNodes.nodeType, dispatchMode: mpNodes.dispatchMode })
      .from(mpNodes).where(and(eq(mpNodes.tenantId, this.tenantId), eq(mpNodes.id, nodeId)));
    if (!node) throw new NotFoundError('Node not found');
    const mode = node.dispatchMode;
    // A pooled node dispatches its whole window as one tanker, so a shift filter
    // would report an availability the operator cannot actually draw against.
    const effShift = isPooled(mode) ? undefined : shift;
    const batches = await this.collectedFor(nodeId, node.nodeType, mode, collectionDate, effShift);
    // A pool is dispatched as one tanker dated on the anchor day (shift null), so
    // the dispatched side stays anchored there regardless of the shift filter.
    const dispatchRows = await this.outflowsByType(nodeId, collectionDate, effShift);
    // Sold litres are inside `dispatchRows` (they draw the slot down the same
    // way), but they are not a dispatch — pulled out again so the figure the
    // operator reads still means "sent onward".
    const saleRows = await this.salesByType(nodeId, collectionDate, effShift);
    const soldOf = (t: MilkType | null) => round3(saleRows
      .filter((r) => r.milkType === t).reduce((sum, r) => sum + r.qty, 0));

    const left = drawDown(batches, dispatchRows);
    const types = [...new Set([
      ...batches.map((b) => b.milkType),
      ...dispatchRows.filter((r) => r.milkType != null).map((r) => r.milkType),
    ])];

    const byMilkType: MilkTypeAvailability[] = types.map((t) => {
      const collected = weigh(batches.filter((b) => b.milkType === t)).qty;
      const rest = weigh(left.filter((b) => b.milkType === t));
      const sold = soldOf(t);
      return {
        milkType: t, collected, dispatched: round3(collected - rest.qty - sold), sold,
        available: rest.qty,
        avgFat: rest.fat, avgSnf: rest.snf, avgWater: rest.water,
      };
    }).sort((a, b) => b.available - a.available);

    // Headline figures: one type when the caller scoped to it, else the whole node.
    const scoped = milkType ? byMilkType.filter((r) => r.milkType === milkType) : byMilkType;
    const scopedLeft = milkType ? left.filter((b) => b.milkType === milkType) : left;
    const collected = round3(scoped.reduce((t, r) => t + r.collected, 0));
    const dispatched = round3(scoped.reduce((t, r) => t + r.dispatched, 0));
    const sold = round3(scoped.reduce((t, r) => t + r.sold, 0));
    // QC describes what's still on hand, not everything collected — the second
    // dispatch of a day must prefill the remaining batch's FAT/SNF, not the blend.
    const qc = weigh(scopedLeft);
    return {
      nodeId, collectionDate, nodeType: node.nodeType,
      collected, dispatched, sold, available: round3(collected - dispatched - sold),
      avgFat: qc.fat, avgSnf: qc.snf, avgWater: qc.water,
      byMilkType,
    };
  }

  /**
   * What the node holds, by its own mode: a VMCC counts its pours, a CC/PP counts
   * milk received in, and an `overnight` node of either kind counts across the
   * two-day window instead of a single date.
   *
   * The VMCC/CC split and the windowed/single-date split are orthogonal, which is
   * why they're resolved together here rather than at each call site — an
   * overnight VMCC was previously unreachable, because only the receipts path had
   * a windowed variant.
   */
  private async collectedFor(
    nodeId: string, nodeType: string, mode: DispatchMode, date: string, shift?: 'am' | 'pm',
  ): Promise<Batch[]> {
    const window = mode === 'overnight' ? ccReceiveWindow(true, date) : null;
    if (nodeType === 'vmcc') {
      return window
        ? this.collectedFromPoursWindow(nodeId, window)
        : this.collectedFromPours(nodeId, date, shift);
    }
    return window
      ? this.collectedFromReceiptsWindow(nodeId, window)
      : this.collectedFromReceipts(nodeId, date, shift);
  }

  /** Litres still on hand to dispatch at a node for a date/shift (collected − dispatched). */
  private async availableToDispatch(
    nodeId: string, date: string, nodeType: string, shift?: 'am' | 'pm', milkType?: MilkType,
  ): Promise<number> {
    const batches = nodeType === 'vmcc'
      ? await this.collectedFromPours(nodeId, date, shift)
      : await this.collectedFromReceipts(nodeId, date, shift);
    const outflows = await this.outflowsByType(nodeId, date, shift);
    return availableOf(batches, outflows, milkType);
  }

  /** Recorded pours at a VMCC, oldest first. */
  private async collectedFromPours(nodeId: string, date: string, shift?: 'am' | 'pm'): Promise<Batch[]> {
    const rows = await this.db.select({
      qty: mpPours.qtyLitres, fat: mpPours.fat, snf: mpPours.snf, water: mpPours.water,
      milkType: mpPours.milkType,
    }).from(mpPours).where(and(eq(mpPours.tenantId, this.tenantId), eq(mpPours.nodeId, nodeId),
      eq(mpPours.collectionDate, date), eq(mpPours.status, 'recorded'),
      ...(shift ? [eq(mpPours.shift, shift)] : [])))
      .orderBy(asc(mpPours.createdAt));
    return rows.map(toBatch);
  }

  /** Recorded pours at a VMCC over an explicit set of (date, shift) slots — an
   * overnight VMCC chills its PM milk and sends it with the next morning's. */
  private async collectedFromPoursWindow(nodeId: string, slots: Slot[]): Promise<Batch[]> {
    const slotCond = or(...slots.map((s) => and(
      eq(mpPours.collectionDate, s.date), eq(mpPours.shift, s.shift))));
    const rows = await this.db.select({
      qty: mpPours.qtyLitres, fat: mpPours.fat, snf: mpPours.snf, water: mpPours.water,
      milkType: mpPours.milkType,
    }).from(mpPours).where(and(eq(mpPours.tenantId, this.tenantId), eq(mpPours.nodeId, nodeId),
      eq(mpPours.status, 'recorded'), slotCond))
      .orderBy(asc(mpPours.createdAt));
    return rows.map(toBatch);
  }

  /** Milk received in at a CC/PP, oldest first. */
  private async collectedFromReceipts(nodeId: string, date: string, shift?: 'am' | 'pm'): Promise<Batch[]> {
    const rows = await this.db.select({
      qty: mpConsignments.receiptQty, fat: mpConsignments.receiptFat,
      snf: mpConsignments.receiptSnf, water: mpConsignments.receiptWater,
      milkType: mpConsignments.milkType,
    }).from(mpConsignments).where(and(eq(mpConsignments.tenantId, this.tenantId), eq(mpConsignments.toNodeId, nodeId),
      eq(mpConsignments.collectionDate, date), eq(mpConsignments.status, 'received'),
      ...receiptShiftCond(shift)))
      .orderBy(asc(mpConsignments.receivedAt));
    return rows.map(toBatch);
  }

  /** Qty + weighted QC of milk received in over an explicit set of (date, shift)
   * slots — an overnight CC's pool spans two calendar days. */
  private async collectedFromReceiptsWindow(nodeId: string, slots: Slot[]): Promise<Batch[]> {
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
    const rows = await this.db.select({
      qty: mpConsignments.receiptQty, fat: mpConsignments.receiptFat,
      snf: mpConsignments.receiptSnf, water: mpConsignments.receiptWater,
      milkType: mpConsignments.milkType,
    }).from(mpConsignments).where(and(eq(mpConsignments.tenantId, this.tenantId),
      eq(mpConsignments.toNodeId, nodeId), eq(mpConsignments.status, 'received'), slotCond))
      .orderBy(asc(mpConsignments.receivedAt));
    return rows.map(toBatch);
  }

  /** Litres on hand for an overnight node's pool (windowed intake − the anchor
   * day's dispatch). Works for a VMCC (pours) and a CC (receipts) alike. */
  private async overnightPoolAvailable(
    nodeId: string, nodeType: string, anchorDate: string, milkType?: MilkType,
  ): Promise<number> {
    const batches = await this.collectedFor(nodeId, nodeType, 'overnight', anchorDate);
    const outflows = await this.outflowsByType(nodeId, anchorDate);
    return availableOf(batches, outflows, milkType);
  }

  private async sumDispatched(nodeId: string, date: string, shift?: 'am' | 'pm'): Promise<number> {
    const rows = await this.dispatchedByType(nodeId, date, shift);
    return rows.reduce((t, r) => t + r.qty, 0);
  }

  /** Everything that left the node: consignments dispatched onward PLUS milk
   * sold to a trader-farmer at the gate. Both draw the slot down, so both have
   * to come off availability — otherwise the sold litres look dispatchable and
   * the next tanker is over-promised. */
  private async outflowsByType(
    nodeId: string, date: string, shift?: 'am' | 'pm',
  ): Promise<{ milkType: MilkType | null; qty: number }[]> {
    const [dispatched, sold] = await Promise.all([
      this.dispatchedByType(nodeId, date, shift),
      this.salesByType(nodeId, date, shift),
    ]);
    return [...dispatched, ...sold];
  }

  /** Bulk milk sold to farmers at this node, by milk type. Reversed sales are
   * out, and so are product sales — a tin of ghee moves no milk off the pool. */
  private async salesByType(
    nodeId: string, date: string, shift?: 'am' | 'pm',
  ): Promise<{ milkType: MilkType; qty: number }[]> {
    const rows = await this.db.select({
      milkType: mpFarmerSales.milkType,
      q: sql<string>`coalesce(sum(${mpFarmerSales.qty}), 0)`,
    }).from(mpFarmerSales)
      .where(and(eq(mpFarmerSales.tenantId, this.tenantId), eq(mpFarmerSales.nodeId, nodeId),
        eq(mpFarmerSales.kind, 'raw_milk'),
        eq(mpFarmerSales.saleDate, date), isNull(mpFarmerSales.reversedAt),
        ...saleShiftCond(shift)))
      .groupBy(mpFarmerSales.milkType);
    return rows.flatMap((r) => (r.milkType
      ? [{ milkType: r.milkType, qty: Number(r.q ?? 0) }]
      : []));
  }

  /** Dispatched litres split by the consignment's milk type. Legacy rows carry a
   * null type; those litres can't be attributed to one type and are consumed
   * across the pool afterwards (see `availability`). */
  private async dispatchedByType(
    nodeId: string, date: string, shift?: 'am' | 'pm',
  ): Promise<{ milkType: MilkType | null; qty: number }[]> {
    const rows = await this.db.select({
      milkType: mpConsignments.milkType,
      q: sql<string>`coalesce(sum(${mpConsignments.dispatchQty}), 0)`,
    }).from(mpConsignments)
      .where(and(eq(mpConsignments.tenantId, this.tenantId), eq(mpConsignments.fromNodeId, nodeId),
        eq(mpConsignments.collectionDate, date), inArray(mpConsignments.status, ['in_transit', 'received']),
        ...receiptShiftCond(shift)))
      .groupBy(mpConsignments.milkType);
    return rows.map((r) => ({ milkType: r.milkType, qty: Number(r.q ?? 0) }));
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
   *  a milk-type item mapped, else skipped. Valued from the pours behind the leg
   *  (see `RawMilkCostService`); the matching GL entry is still to come, so stock
   *  carries a value the ledger doesn't yet mirror — step 2 of
   *  `docs/dhenu-raw-milk-valuation.md`. Returns the ledger id or null. */
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
    // An untyped consignment must never be given a type here. The old `?? 'mixed'`
    // fallback resolved through the tenant's 'mixed' mapping — which points at the
    // A1 raw-milk item — so a can holding both buffalo and cow milk landed in stock
    // as pure A1 and would be manufactured as A1. Skipping leaves the milk off the
    // raw-milk ledger, which is visible and fixable; mislabelling it is neither.
    if (!c.milkType) return null;
    const [map] = await tx.select({ itemId: mpRawMilkItems.itemId }).from(mpRawMilkItems)
      .where(and(eq(mpRawMilkItems.tenantId, this.tenantId),
        eq(mpRawMilkItems.milkType, c.milkType)));
    if (!map) return null;
    const unitCost = await new RawMilkCostService(this.tenantId).unitCost(tx, c);
    const { ledgerId } = await new StockLedgerService(this.tenantId).recordMovement(tx, {
      itemId: map.itemId, warehouseId: settings.wh, batchNo: c.consignmentNo,
      movementType: 'grn', sourceType: 'mp_receipt', sourceId: c.id,
      qtyDelta: qty, unitCost, movedAt: new Date(`${c.collectionDate}T00:00:00Z`),
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

/** One receipt (or pour) as it landed — the unit FIFO consumes. `seq` preserves
 * arrival order so batches can be regrouped by milk type and still consumed
 * oldest-first afterwards. */
interface Batch {
  seq: number; milkType: MilkType | null;
  qty: number; fat: number | null; snf: number | null; water: number | null;
}

/**
 * Shift filter for a per-shift consignment figure.
 *
 * A whole-day consignment carries `shift = null` (a BMC node pools its day and
 * dispatches one tanker). Filtering those rows out with a bare `shift = 'am'`
 * makes them vanish: milk a BMC VMCC dispatches whole-day is RECEIVED by a
 * per-shift CC downstream but contributes 0 L to either of that CC's shifts, so
 * it can never be dispatched onward. Folding null onto AM mirrors the app's
 * `shiftFrom(null) === 'am'` and the overnight window's own fold
 * (`collectedFromReceiptsWindow`), which had this right already.
 *
 * Applied to the dispatched side too. A node switched from day-pooled to
 * per-shift has historic null-shift dispatch rows; ignoring them would count
 * that milk as still on hand and let it be dispatched twice. Attributing them to
 * AM can only understate what's available, which is the safe direction.
 */
/** Same null-folds-onto-AM rule as `receiptShiftCond`: a sale at a pooled node
 * carries no shift, and must still come off a per-shift reading of that day. */
function saleShiftCond(shift?: 'am' | 'pm') {
  if (!shift) return [];
  return [shift === 'am'
    ? or(eq(mpFarmerSales.shift, 'am'), isNull(mpFarmerSales.shift))
    : eq(mpFarmerSales.shift, shift)];
}

function receiptShiftCond(shift?: 'am' | 'pm') {
  if (!shift) return [];
  return [shift === 'am'
    ? or(eq(mpConsignments.shift, 'am'), isNull(mpConsignments.shift))
    : eq(mpConsignments.shift, shift)];
}

type BatchRow = {
  qty: string | null; fat: string | null; snf: string | null; water: string | null;
  milkType: MilkType | null;
};

/** Numeric columns arrive as strings from pg; a null qty counts as zero litres. */
function toBatch(r: BatchRow, seq: number): Batch {
  return {
    seq, milkType: r.milkType,
    qty: Number(r.qty ?? 0), fat: numOrNull2(r.fat), snf: numOrNull2(r.snf), water: numOrNull2(r.water),
  };
}

/** Volume-weighted QC over a batch list. A batch missing a metric is left out of
 * that metric's weighting rather than counted as zero. */
function weigh(batches: Batch[]): SourceAgg {
  let qty = 0;
  const acc = { fat: 0, snf: 0, water: 0 };
  const wt = { fat: 0, snf: 0, water: 0 };
  for (const b of batches) {
    qty += b.qty;
    for (const k of ['fat', 'snf', 'water'] as const) {
      if (b[k] != null) { acc[k] += b.qty * b[k]!; wt[k] += b.qty; }
    }
  }
  const avg = (k: 'fat' | 'snf' | 'water') => (wt[k] > 0 ? round2(acc[k] / wt[k]) : null);
  return { qty: round3(qty), fat: avg('fat'), snf: avg('snf'), water: avg('water') };
}

/** What's still on hand: drop `dispatched` litres oldest-first and return the rest.
 * Weighting every receipt — including already-dispatched ones — makes the second
 * dispatch of a day prefill the whole day's blend instead of the batch actually
 * left in the tank. The straddling batch is split pro-rata. */
/** What's left after every dispatch is taken off. Each type is drawn down by its
 * own dispatches first; untyped (pre-split) dispatches name no type, so they come
 * off the whole pool in arrival order afterwards — otherwise a legacy tanker would
 * leave every type looking fully available. */
function drawDown(batches: Batch[], dispatched: { milkType: MilkType | null; qty: number }[]): Batch[] {
  const typed = new Map<MilkType | null, number>();
  let untyped = 0;
  for (const r of dispatched) {
    if (r.milkType == null) untyped += r.qty;
    else typed.set(r.milkType, (typed.get(r.milkType) ?? 0) + r.qty);
  }
  const types = [...new Set([...batches.map((b) => b.milkType), ...typed.keys()])];

  // What a type's own batches couldn't cover. Milk received before the per-type
  // split sits on a NULL-type batch, so a dispatch naming a type could never
  // consume it: the litres left the node and availability never moved, leaving
  // the slot dispatchable again — and again. Untyped milk is of UNKNOWN type,
  // not of no type, so it can legitimately satisfy any type's draw.
  let shortfall = 0;
  const afterTyped = types.flatMap((t) => {
    const own = batches.filter((b) => b.milkType === t);
    const want = typed.get(t) ?? 0;
    if (t != null && want > 0) {
      shortfall += Math.max(0, want - own.reduce((s, b) => s + b.qty, 0));
    }
    return remainderBatches(own, want);
  });

  // Restricted to the NULL batches on purpose. Routing the shortfall through the
  // whole-pool pass below would let an over-dispatch of one type quietly eat
  // another's milk, which is a far worse error than the one being fixed.
  const drawn = remainderBatches(afterTyped.filter((b) => b.milkType === null), shortfall);
  const pool = [...afterTyped.filter((b) => b.milkType !== null), ...drawn]
    .sort((a, b) => a.seq - b.seq);
  return remainderBatches(pool, untyped);
}

/** Litres on hand, optionally for one milk type. */
/**
 * Litres a dispatch of [milkType] may draw on — its own remaining batches PLUS
 * whatever untyped milk is left.
 *
 * The untyped half is the whole point. Milk received before the per-type split
 * sits on a NULL-type batch, and [drawDown] already lets a typed dispatch
 * consume those litres — "untyped" means unknown type, not no type, and naming
 * the type is exactly what the dispatch card asks the operator to do. Gating on
 * the named type alone contradicted that: the gate said 0 L of cow A1 while the
 * screen offered 137.3 L to send, so legacy milk could never leave the node and
 * the slot stayed on the pending-dispatch badge forever. Seen at Vrindavan CC,
 * where 137.3 L of 17 Jul milk was stuck from July to late August.
 *
 * The gate and the draw now read the same pool, which is the invariant that was
 * broken: anything this permits, [drawDown] will actually consume.
 */
function availableOf(
  batches: Batch[], dispatched: { milkType: MilkType | null; qty: number }[], milkType?: MilkType,
): number {
  const left = drawDown(batches, dispatched);
  return weigh(milkType
    ? left.filter((b) => b.milkType === milkType || b.milkType === null)
    : left).qty;
}

function remainderBatches(batches: Batch[], dispatched: number): Batch[] {
  let toDrop = Math.max(0, dispatched);
  const left: Batch[] = [];
  for (const b of batches) {
    if (toDrop <= 0) { left.push(b); continue; }
    if (toDrop >= b.qty) { toDrop -= b.qty; continue; }
    left.push({ ...b, qty: b.qty - toDrop });
    toDrop = 0;
  }
  return left;
}

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
