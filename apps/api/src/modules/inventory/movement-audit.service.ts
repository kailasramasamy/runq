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
  deliveryNotes, customers, salesInvoices,
  inventoryTransfers, inventoryAdjustments, inventoryStockTakes,
  workOrders, boms, woConsumption, woOutput, mfgReclaims,
  mpConsignments,
} from '@runq/db';
import type { ItemMovementFilter } from '@runq/validators';

/** Document kinds the UI knows how to deep-link. */
export type MovementDocKind =
  | 'grn' | 'delivery_note' | 'work_order' | 'transfer' | 'adjustment'
  | 'stock_take' | 'reclaim' | 'consignment' | 'invoice' | 'purchase_order'
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
    if (filter.from) conds.push(gte(stockLedger.movedAt, new Date(filter.from)));
    // End-of-day boundary, not midnight — `to` is inclusive of its own date.
    if (filter.to) conds.push(lte(stockLedger.movedAt, new Date(`${filter.to}T23:59:59.999Z`)));
    if (filter.direction === 'in') conds.push(sql`${stockLedger.qtyIn} > 0`);
    if (filter.direction === 'out') conds.push(sql`${stockLedger.qtyOut} > 0`);

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
      .orderBy(desc(stockLedger.movedAt), desc(stockLedger.postedAt))
      .limit(filter.limit + 1)
      .offset((filter.page - 1) * filter.limit);

    const hasMore = rows.length > filter.limit;
    const page = hasMore ? rows.slice(0, filter.limit) : rows;
    const docs = await this.resolveDocs(page.map((r) => r.l));

    return {
      hasMore,
      rows: page.map(({ l, warehouseName, postedByName }) => {
        const qtyIn = Number(l.qtyIn);
        const qtyOut = Number(l.qtyOut);
        const unitCost = Number(l.unitCost);
        return {
          id: l.id,
          movedAt: l.movedAt,
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
   * Batch-resolve every (source_type, source_id) on the page. Keys are
   * "<sourceType>|<sourceId>" so a reversal and its original never collide.
   */
  private async resolveDocs(rows: Array<{ sourceType: string; sourceId: string }>): Promise<DocMap> {
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
    run('delivery_note', (ids) => this.dnDocs(ids));
    run('sales_return', (ids) => this.dnDocs(ids));
    run('inventory_transfer', (ids) => this.transferDocs(ids));
    run('inventory_adjustment', (ids) => this.adjustmentDocs(ids));
    run('inventory_stock_take', (ids) => this.stockTakeDocs(ids));
    run('work_order', (ids) => this.woDocs(ids));
    run('work_order_reversal', (ids) => this.woReversalDocs(ids));
    run('mfg_reclaim', (ids) => this.reclaimDocs(ids));
    run('mp_receipt', (ids) => this.consignmentDocs(ids));
    run('mp_receipt_adjustment', (ids) => this.consignmentDocs(ids));

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
  private async dnDocs(ids: string[]): Promise<Array<[string, MovementDoc]>> {
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
      ref: r.invoiceId && r.invoiceNo
        ? { kind: 'invoice' as const, id: r.invoiceId, no: r.invoiceNo, label: 'Invoice' }
        : null,
    }]);
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
      note: [r.reason.replace(/_/g, ' '), r.notes].filter(Boolean).join(' — '),
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
