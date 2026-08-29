/**
 * Per-item stock audit trail.
 *
 * `stock_ledger` already records every movement, but only as
 * (source_type, source_id) — a raw UUID pair that means nothing on screen.
 * This service reads the ledger for one item and resolves each source back
 * to its document: GRN no + vendor, DN no + customer + the sales invoice it
 * dispatched against, WO no + BOM for production consumption/output, and so on.
 *
 * Resolution is batched — one query per source_type present in the page,
 * never one per row.
 */

import { and, eq, gte, inArray, lte, desc, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Db } from '@runq/db';
import {
  stockLedger, warehouses, users,
  inventoryGrns, vendors, purchaseOrdersV2, purchaseInvoices,
  deliveryNotes, deliveryNoteLines, customers, salesInvoices, items,
  inventoryTransfers, inventoryAdjustments, inventoryStockTakes,
  workOrders, boms, woConsumption, woOutput, mfgReclaims,
  mpConsignments, mpFarmerSales, mpFarmers, mpNodes,
} from '@runq/db';
import { movementGroupMembers } from '@runq/validators';
import type { ItemMovementFilter } from '@runq/validators';
import { istDate } from '../manufacturing/mfg-day';

/** Document kinds the UI knows how to deep-link. */
export type MovementDocKind =
  | 'grn' | 'delivery_note' | 'work_order' | 'transfer' | 'adjustment'
  | 'stock_take' | 'reclaim' | 'consignment' | 'farmer_sale' | 'invoice' | 'purchase_order'
  | 'bill' | 'bom';

export interface MovementDocRef {
  kind: MovementDocKind;
  id: string;
  no: string;
  /** Short label for the secondary reference, e.g. "Invoice" or "BOM". */
  label?: string;
}

export interface MovementDoc extends MovementDocRef {
  date: string | null;
  status: string | null;
  /** Customer / vendor / counterparty name, when the document has one. */
  party: string | null;
  /** Free-text context: adjustment reason, BOM + output item, warehouse hop. */
  note: string | null;
  /** Secondary document worth linking to — invoice for a DN, PO/bill for a GRN. */
  ref: MovementDocRef | null;
  /**
   * The item this movement went out *in place of*, when it was a substitution.
   *
   * Without it a stand-in reads as an ordinary sale of itself. Fourteen A2
   * pouches leaving to cover a Farm Fresh order look, on A2's movement trail,
   * exactly like fourteen A2 pouches being sold — which then distorts every
   * reading of what A2 actually sells, and leaves the person auditing a
   * discrepancy with no way to tell the two apart.
   */
  substitutedFor?: string | null;
}

type DocMap = Map<string, MovementDoc>;

/** Movement types that put stock on the shelf. */
const INBOUND = new Set([
  'grn', 'transfer_in', 'adjustment_in', 'opening', 'stock_take_in',
  'production_in', 'sales_return_in', 'reclaim_in',
]);

export class ItemMovementAuditService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async itemMovements(itemId: string, filter: ItemMovementFilter) {
    const conds = [
      eq(stockLedger.tenantId, this.tenantId),
      eq(stockLedger.itemId, itemId),
    ];
    if (filter.warehouseId) conds.push(eq(stockLedger.warehouseId, filter.warehouseId));
    if (filter.batchNo) conds.push(eq(stockLedger.batchNo, filter.batchNo));
    if (filter.from) conds.push(gte(stockLedger.movedAt, new Date(filter.from)));
    // End-of-day boundary, not midnight — `to` is inclusive of its own date.
    if (filter.to) conds.push(lte(stockLedger.movedAt, new Date(`${filter.to}T23:59:59.999Z`)));
    if (filter.direction === 'in') conds.push(sql`${stockLedger.qtyIn} > 0`);
    if (filter.direction === 'out') conds.push(sql`${stockLedger.qtyOut} > 0`);
    // Group is the coarse cut ("Adjustments"), type the exact one
    // ("Adjustment out"). A type alone is a complete filter, so the two are
    // independent clauses rather than nested.
    if (filter.group) {
      conds.push(inArray(stockLedger.movementType, [...movementGroupMembers[filter.group]]));
    }
    if (filter.type) conds.push(eq(stockLedger.movementType, filter.type));

    // Chronology, not `moved_at` alone. Document-driven movements stamp
    // `moved_at` with the document's *date* (midnight), while production
    // stamps the actual instant — so within one day a 6pm production run
    // sorts above the 9pm dispatches that drew stock from it, and the
    // running balance beside them reads 912 → 159 → 722. The IST calendar
    // day still comes from `moved_at` (that is the day the movement belongs
    // to, and the day the UI groups under, even for a backdated document);
    // only the order inside the day comes from `posted_at`, which is the
    // one column that always records when the row was really written.
    const istDay = istDate(stockLedger.movedAt);

    // Over-fetch by one so the client knows whether another page exists
    // without paying for a COUNT(*) over the whole ledger.
    const rows = await this.db
      .select({
        l: stockLedger,
        warehouseName: warehouses.name,
        postedByName: users.name,
      })
      .from(stockLedger)
      .innerJoin(warehouses, eq(warehouses.id, stockLedger.warehouseId))
      .leftJoin(users, eq(users.id, stockLedger.postedBy))
      .where(and(...conds))
      // `id` last so the page is the exact reverse of the chain order the
      // running balance is summed in — two rows written in one transaction
      // share a `posted_at`, and without the tiebreak they can print in an
      // order their balances don't follow.
      .orderBy(sql`${istDay} DESC`, desc(stockLedger.postedAt), desc(stockLedger.id))
      .limit(filter.limit + 1)
      .offset((filter.page - 1) * filter.limit);

    const hasMore = rows.length > filter.limit;
    const page = hasMore ? rows.slice(0, filter.limit) : rows;
    const [docs, itemRun] = await Promise.all([
      this.resolveDocs(page.map((r) => r.l), itemId),
      this.itemRunningBalances(itemId, filter.warehouseId, page.map((r) => r.l.id)),
    ]);

    return {
      hasMore,
      rows: page.map(({ l, warehouseName, postedByName }) => {
        const qtyIn = Number(l.qtyIn);
        const qtyOut = Number(l.qtyOut);
        const unitCost = Number(l.unitCost);
        return {
          id: l.id,
          movedAt: l.movedAt,
          // When the movement was actually written. Date-only `movedAt`
          // can't show a time, so the trail reads its clock off this.
          postedAt: l.postedAt,
          movementType: l.movementType,
          direction: INBOUND.has(l.movementType) ? 'in' : 'out',
          batchNo: l.batchNo,
          warehouseId: l.warehouseId,
          warehouseName,
          qtyIn,
          qtyOut,
          unitCost,
          value: (qtyIn + qtyOut) * unitCost,
          runningQty: Number(l.runningQty),
          // The item's balance, not the batch's — see itemRunningBalances.
          itemRunningQty: itemRun.get(l.id) ?? Number(l.runningQty),
          postedByName: postedByName ?? null,
          sourceType: l.sourceType,
          sourceId: l.sourceId,
          journalEntryId: l.journalEntryId,
          doc: docs.get(`${l.sourceType}|${l.sourceId}`) ?? null,
        };
      }),
    };
  }

  /**
   * The item's own running balance for each row on the page.
   *
   * `stock_ledger.running_qty` is a *batch* balance — it is on-hand for one
   * (item, warehouse, batch) chain after the movement. On an item trail that
   * reads as a lie: raw milk arrives on a new consignment batch every morning,
   * so yesterday closed at 145 and today's 633-litre receipt shows a balance
   * of 633, not 778, because it opened a fresh chain.
   *
   * So re-derive the balance across batches, in the order the trail renders
   * (IST calendar day of `moved_at`, then `posted_at` — the same order
   * stock-ledger-rechain keeps the stored chain in). The window deliberately
   * ignores the direction / type / date filters and the page window: a
   * running balance that only counted the visible rows would be a running
   * total of the filter, and would not tie back to `stock_on_hand`. The
   * warehouse filter *is* honoured, because a per-warehouse trail wants a
   * per-warehouse balance.
   */
  private async itemRunningBalances(
    itemId: string,
    warehouseId: string | undefined,
    rowIds: string[],
  ): Promise<Map<string, number>> {
    if (rowIds.length === 0) return new Map();
    const whClause = warehouseId
      ? sql`AND warehouse_id = ${warehouseId}`
      : sql``;
    const res = await this.db.execute(sql`
      WITH chain AS (
        SELECT id,
               SUM(qty_in - qty_out) OVER (
                 ORDER BY (moved_at AT TIME ZONE 'Asia/Kolkata')::date, posted_at, id
                 ROWS UNBOUNDED PRECEDING
               ) AS run_qty
          FROM stock_ledger
         WHERE tenant_id = ${this.tenantId}
           AND item_id = ${itemId}
           ${whClause}
      )
      SELECT id, run_qty FROM chain
       WHERE id::text IN (${sql.join(rowIds.map((r) => sql`${r}`), sql`, `)})
    `);
    const rows = (res as unknown as { rows: Array<{ id: string; run_qty: string }> }).rows;
    return new Map(rows.map((r) => [r.id, Number(r.run_qty)]));
  }

  /**
   * Batch-resolve every (source_type, source_id) on the page. Keys are
   * "<sourceType>|<sourceId>" so a reversal and its original never collide.
   */
  private async resolveDocs(
    rows: Array<{ sourceType: string; sourceId: string }>,
    itemId: string,
  ): Promise<DocMap> {
    const byType = new Map<string, string[]>();
    for (const r of rows) {
      const ids = byType.get(r.sourceType);
      if (ids) ids.push(r.sourceId);
      else byType.set(r.sourceType, [r.sourceId]);
    }

    const out: DocMap = new Map();
    const jobs: Array<Promise<void>> = [];
    const run = (type: string, fn: (ids: string[]) => Promise<Array<[string, MovementDoc]>>) => {
      const ids = byType.get(type);
      if (!ids?.length) return;
      jobs.push(
        fn([...new Set(ids)]).then((pairs) => {
          for (const [id, doc] of pairs) out.set(`${type}|${id}`, doc);
        }),
      );
    };

    run('inventory_grn', (ids) => this.grnDocs(ids));
    run('delivery_note', (ids) => this.dnDocs(ids, itemId));
    run('sales_return', (ids) => this.dnDocs(ids, itemId));
    run('inventory_transfer', (ids) => this.transferDocs(ids));
    run('inventory_adjustment', (ids) => this.adjustmentDocs(ids));
    run('inventory_stock_take', (ids) => this.stockTakeDocs(ids));
    run('work_order', (ids) => this.woDocs(ids));
    run('work_order_reversal', (ids) => this.woReversalDocs(ids));
    run('mfg_reclaim', (ids) => this.reclaimDocs(ids));
    run('mp_receipt', (ids) => this.consignmentDocs(ids));
    run('mp_receipt_adjustment', (ids) => this.consignmentDocs(ids));
    run('mp_farmer_sale', (ids) => this.farmerSaleDocs(ids, false));
    run('mp_farmer_sale_reversal', (ids) => this.farmerSaleDocs(ids, true));

    await Promise.all(jobs);
    return out;
  }

  // ─── Resolvers ─────────────────────────────────────────────────────────

  private async grnDocs(ids: string[]): Promise<Array<[string, MovementDoc]>> {
    const rows = await this.db
      .select({
        id: inventoryGrns.id,
        no: inventoryGrns.grnNo,
        date: inventoryGrns.receivedDate,
        status: inventoryGrns.status,
        party: vendors.name,
        poId: purchaseOrdersV2.id,
        poNo: purchaseOrdersV2.poNumber,
        billId: purchaseInvoices.id,
        billNo: purchaseInvoices.invoiceNumber,
      })
      .from(inventoryGrns)
      .leftJoin(vendors, eq(vendors.id, inventoryGrns.vendorId))
      .leftJoin(purchaseOrdersV2, eq(purchaseOrdersV2.id, inventoryGrns.poId))
      .leftJoin(purchaseInvoices, eq(purchaseInvoices.id, inventoryGrns.billId))
      .where(and(eq(inventoryGrns.tenantId, this.tenantId), inArray(inventoryGrns.id, ids)));

    return rows.map((r) => [r.id, {
      kind: 'grn' as const,
      id: r.id,
      no: r.no,
      date: r.date,
      status: r.status,
      party: r.party ?? null,
      note: null,
      ref: r.billId && r.billNo
        ? { kind: 'bill' as const, id: r.billId, no: r.billNo, label: 'Bill' }
        : r.poId && r.poNo
          ? { kind: 'purchase_order' as const, id: r.poId, no: r.poNo, label: 'PO' }
          : null,
    }]);
  }

  /** Dispatches and customer returns share the delivery-note document. */
  private async dnDocs(ids: string[], itemId: string): Promise<Array<[string, MovementDoc]>> {
    const substituted = await this.substitutionsOn(ids, itemId);
    const rows = await this.db
      .select({
        id: deliveryNotes.id,
        no: deliveryNotes.dnNo,
        date: deliveryNotes.dispatchDate,
        status: deliveryNotes.status,
        party: customers.name,
        returnOfDnId: deliveryNotes.returnOfDnId,
        invoiceId: salesInvoices.id,
        invoiceNo: salesInvoices.invoiceNumber,
      })
      .from(deliveryNotes)
      .leftJoin(customers, eq(customers.id, deliveryNotes.customerId))
      .leftJoin(salesInvoices, eq(salesInvoices.id, deliveryNotes.invoiceId))
      .where(and(eq(deliveryNotes.tenantId, this.tenantId), inArray(deliveryNotes.id, ids)));

    return rows.map((r) => [r.id, {
      kind: 'delivery_note' as const,
      id: r.id,
      no: r.no,
      date: r.date,
      status: r.status,
      party: r.party ?? null,
      note: r.returnOfDnId ? 'Customer return' : null,
      substitutedFor: substituted.get(r.id) ?? null,
      ref: r.invoiceId && r.invoiceNo
        ? { kind: 'invoice' as const, id: r.invoiceId, no: r.invoiceNo, label: 'Invoice' }
        : null,
    }]);
  }

  /**
   * Which of these delivery notes shipped *this* item as a stand-in, and for
   * what. Keyed by delivery note, since the trail is already scoped to one
   * item — a note carrying the same item twice is not worth modelling.
   */
  private async substitutionsOn(
    dnIds: string[],
    itemId: string,
  ): Promise<Map<string, string>> {
    const replaced = alias(items, 'replaced_item');
    const rows = await this.db
      .select({
        dnId: deliveryNoteLines.dnId,
        name: replaced.name,
        uom: replaced.unit,
      })
      .from(deliveryNoteLines)
      .innerJoin(replaced, eq(replaced.id, deliveryNoteLines.substitutedForItemId))
      .where(and(
        eq(deliveryNoteLines.tenantId, this.tenantId),
        eq(deliveryNoteLines.itemId, itemId),
        inArray(deliveryNoteLines.dnId, dnIds),
      ));

    const out = new Map<string, string>();
    for (const r of rows) {
      // The pack size matters as much as the name: one product name covers
      // several SKUs, and "in place of Farm Fresh Cow Milk" doesn't say which.
      out.set(r.dnId, r.uom ? `${r.name} ${r.uom}` : r.name);
    }
    return out;
  }

  private async transferDocs(ids: string[]): Promise<Array<[string, MovementDoc]>> {
    const fromWh = alias(warehouses, 'from_wh');
    const toWh = alias(warehouses, 'to_wh');
    const rows = await this.db
      .select({
        id: inventoryTransfers.id,
        no: inventoryTransfers.transferNo,
        status: inventoryTransfers.status,
        dispatchedAt: inventoryTransfers.dispatchedAt,
        fromName: fromWh.name,
        toName: toWh.name,
      })
      .from(inventoryTransfers)
      .leftJoin(fromWh, eq(fromWh.id, inventoryTransfers.fromWarehouseId))
      .leftJoin(toWh, eq(toWh.id, inventoryTransfers.toWarehouseId))
      .where(and(eq(inventoryTransfers.tenantId, this.tenantId), inArray(inventoryTransfers.id, ids)));

    return rows.map((r) => [r.id, {
      kind: 'transfer' as const,
      id: r.id,
      no: r.no,
      date: r.dispatchedAt ? r.dispatchedAt.toISOString().slice(0, 10) : null,
      status: r.status,
      party: null,
      note: r.fromName && r.toName ? `${r.fromName} → ${r.toName}` : null,
      ref: null,
    }]);
  }

  private async adjustmentDocs(ids: string[]): Promise<Array<[string, MovementDoc]>> {
    const rows = await this.db
      .select({
        id: inventoryAdjustments.id,
        no: inventoryAdjustments.adjNo,
        date: inventoryAdjustments.adjustmentDate,
        status: inventoryAdjustments.status,
        reason: inventoryAdjustments.reason,
        notes: inventoryAdjustments.notes,
      })
      .from(inventoryAdjustments)
      .where(and(
        eq(inventoryAdjustments.tenantId, this.tenantId),
        inArray(inventoryAdjustments.id, ids),
      ));

    return rows.map((r) => [r.id, {
      kind: 'adjustment' as const,
      id: r.id,
      no: r.no,
      date: r.date,
      status: r.status,
      party: null,
      // `other` keeps its reason in the note — printing "other — <note>"
      // would spend the line on the word that says nothing. Every other
      // reason is a real category and leads.
      note: r.reason === 'other'
        ? (r.notes ?? 'Other')
        : [r.reason.replace(/_/g, ' '), r.notes].filter(Boolean).join(' — '),
      ref: null,
    }]);
  }

  private async stockTakeDocs(ids: string[]): Promise<Array<[string, MovementDoc]>> {
    const rows = await this.db
      .select({
        id: inventoryStockTakes.id,
        no: inventoryStockTakes.stNo,
        status: inventoryStockTakes.status,
        completedAt: inventoryStockTakes.completedAt,
        notes: inventoryStockTakes.notes,
      })
      .from(inventoryStockTakes)
      .where(and(
        eq(inventoryStockTakes.tenantId, this.tenantId),
        inArray(inventoryStockTakes.id, ids),
      ));

    return rows.map((r) => [r.id, {
      kind: 'stock_take' as const,
      id: r.id,
      no: r.no,
      date: r.completedAt ? r.completedAt.toISOString().slice(0, 10) : null,
      status: r.status,
      party: null,
      note: r.notes ?? 'Physical count variance',
      ref: null,
    }]);
  }

  /** Production consumption + output. The BOM is the "why" for a raw material. */
  private async woDocs(ids: string[]): Promise<Array<[string, MovementDoc]>> {
    const rows = await this.woRows(ids);
    return rows.map((r) => [r.id, this.woDoc(r)]);
  }

  /**
   * Reversal rows point at a wo_consumption / wo_output line, not the WO.
   * Consumption rows are deleted by the reversal itself, so a miss here is
   * expected — the row still renders, just without a WO link.
   */
  private async woReversalDocs(ids: string[]): Promise<Array<[string, MovementDoc]>> {
    const [cons, outs] = await Promise.all([
      this.db
        .select({ lineId: woConsumption.id, woId: woConsumption.woId })
        .from(woConsumption)
        .where(and(eq(woConsumption.tenantId, this.tenantId), inArray(woConsumption.id, ids))),
      this.db
        .select({ lineId: woOutput.id, woId: woOutput.woId })
        .from(woOutput)
        .where(and(eq(woOutput.tenantId, this.tenantId), inArray(woOutput.id, ids))),
    ]);

    const lineToWo = new Map([...cons, ...outs].map((r) => [r.lineId, r.woId]));
    if (!lineToWo.size) return [];

    const woRows = await this.woRows([...new Set(lineToWo.values())]);
    const byWo = new Map(woRows.map((r) => [r.id, r]));

    const pairs: Array<[string, MovementDoc]> = [];
    for (const [lineId, woId] of lineToWo) {
      const wo = byWo.get(woId);
      if (!wo) continue;
      pairs.push([lineId, { ...this.woDoc(wo), note: `Reversed — ${this.woNote(wo)}` }]);
    }
    return pairs;
  }

  private async woRows(ids: string[]) {
    return this.db
      .select({
        id: workOrders.id,
        no: workOrders.woNumber,
        date: workOrders.scheduledFor,
        status: workOrders.status,
        entryMode: workOrders.entryMode,
        bomId: boms.id,
        bomCode: boms.bomCode,
        bomName: boms.name,
        bomVersion: workOrders.bomVersion,
      })
      .from(workOrders)
      .leftJoin(boms, eq(boms.id, workOrders.bomId))
      .where(and(eq(workOrders.tenantId, this.tenantId), inArray(workOrders.id, ids)));
  }

  private woNote(r: Awaited<ReturnType<ItemMovementAuditService['woRows']>>[number]) {
    const bom = r.bomName ? `${r.bomName} v${r.bomVersion}` : null;
    const mode = r.entryMode === 'unplanned' ? 'Unplanned run' : 'Production run';
    return [mode, bom].filter(Boolean).join(' · ');
  }

  private woDoc(r: Awaited<ReturnType<ItemMovementAuditService['woRows']>>[number]): MovementDoc {
    return {
      kind: 'work_order',
      id: r.id,
      no: r.no,
      date: r.date,
      status: r.status,
      party: null,
      note: this.woNote(r),
      ref: r.bomId && r.bomCode
        ? { kind: 'bom', id: r.bomId, no: r.bomCode, label: 'BOM' }
        : null,
    };
  }

  private async reclaimDocs(ids: string[]): Promise<Array<[string, MovementDoc]>> {
    const rows = await this.db
      .select({
        id: mfgReclaims.id,
        no: mfgReclaims.reclaimNo,
        date: mfgReclaims.reclaimDate,
        status: mfgReclaims.status,
        notes: mfgReclaims.notes,
      })
      .from(mfgReclaims)
      .where(and(eq(mfgReclaims.tenantId, this.tenantId), inArray(mfgReclaims.id, ids)));

    return rows.map((r) => [r.id, {
      kind: 'reclaim' as const,
      id: r.id,
      no: r.no,
      date: r.date,
      status: r.status,
      party: null,
      note: r.notes ?? 'Finished goods torn down to raw material',
      ref: null,
    }]);
  }

  /**
   * Goods handed to a farmer over the counter — the trader who supplies us and
   * buys from us.
   *
   * These rows post as a plain `delivery`, so without a name behind them the
   * trail reads "stock left, reason unknown". The farmer IS the counterparty,
   * so they belong in `party` exactly as a customer does on a delivery note;
   * the note carries what the badge cannot say — that this was a gate sale, and
   * where it was handed over.
   */
  private async farmerSaleDocs(
    ids: string[], reversed: boolean,
  ): Promise<Array<[string, MovementDoc]>> {
    const rows = await this.db
      .select({
        id: mpFarmerSales.id,
        date: mpFarmerSales.saleDate,
        code: mpFarmers.code,
        farmer: mpFarmers.name,
        node: mpNodes.name,
        reversedAt: mpFarmerSales.reversedAt,
      })
      .from(mpFarmerSales)
      .innerJoin(mpFarmers, eq(mpFarmers.id, mpFarmerSales.farmerId))
      .innerJoin(mpNodes, eq(mpNodes.id, mpFarmerSales.nodeId))
      .where(and(eq(mpFarmerSales.tenantId, this.tenantId), inArray(mpFarmerSales.id, ids)));

    return rows.map((r) => [r.id, {
      kind: 'farmer_sale' as const,
      id: r.id,
      no: r.code,
      date: r.date,
      status: r.reversedAt ? 'reversed' : null,
      party: r.farmer,
      note: [reversed ? 'Sale to farmer reversed' : 'Sale to farmer', r.node]
        .filter(Boolean).join(' · '),
      ref: null,
    }]);
  }

  private async consignmentDocs(ids: string[]): Promise<Array<[string, MovementDoc]>> {
    const rows = await this.db
      .select({
        id: mpConsignments.id,
        no: mpConsignments.consignmentNo,
        date: mpConsignments.collectionDate,
        shift: mpConsignments.shift,
        milkType: mpConsignments.milkType,
      })
      .from(mpConsignments)
      .where(and(eq(mpConsignments.tenantId, this.tenantId), inArray(mpConsignments.id, ids)));

    return rows.map((r) => [r.id, {
      kind: 'consignment' as const,
      id: r.id,
      no: r.no,
      date: r.date,
      status: null,
      party: null,
      note: ['Milk receipt', r.shift?.toUpperCase(), r.milkType].filter(Boolean).join(' · '),
      ref: null,
    }]);
  }
}
