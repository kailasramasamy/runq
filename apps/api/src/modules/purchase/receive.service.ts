import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  purchaseOrdersV2,
  purchaseOrderLinesV2,
  inventoryGrns,
  inventoryGrnLines,
  inventorySerials,
  items as itemsTable,
  vendorCatalogItems,
  vendors,
} from '@runq/db';
import type { Db } from '@runq/db';
import type { ReceiveAgainstPoInput } from '@runq/validators';
import { NotFoundError, ConflictError } from '../../utils/errors';
import { nextDocNo } from '../inventory/sequence';
import { StockLedgerService } from '../inventory/stock-ledger.service';
import { InventoryGlPoster } from '../inventory/gl-poster';
import { DEFAULT_EXPENSE_ACCOUNT_CODE } from '../gl/inventory-accounts';

/**
 * PP Phase 2 — Receive against PO.
 * Spec: docs/purchase-procurement-plan.md §5.2.
 *
 * Receives goods against an existing PO. Inline-creates an inventory GRN
 * (source='po'), writes stock_ledger, captures serials, posts the
 * Dr Inventory / Cr GRNI journal entry, updates per-line denormalised
 * qty_received counters on the PO, and auto-transitions PO status.
 *
 * Note on the JE: unlike AP Pattern-B's bill-inline GRN (which posts a
 * unified Dr Inventory / Cr AP-Vendor bill JE and skips GRNI), the
 * PO-receive flow IS a temporal gap from the bill. The standard
 * Dr Inventory / Cr GRNI applies here, then the matched bill later
 * clears Dr GRNI / Cr AP. AP Pattern-B's match path (Phase 3) handles
 * the bill side.
 */
export interface ReceiveTemplateLine {
  poLineId: string;
  lineNo: number;
  description: string;
  uom: string | null;
  hsnSacCode: string | null;
  qtyOrdered: number;
  qtyReceivedSoFar: number;
  qtyOpen: number;
  unitRate: number;
  /**
   * Catalog row backing this PO line — the unit of procurement.
   * Always set: lines without a catalog row predate PP and can't be
   * received through this flow.
   */
  catalogItemId: string | null;
  /**
   * Bridge into the items master. NULL means the catalog row is not
   * inventory-tracked; receive will skip stock ledger + serials and
   * post Dr Expense / Cr GRNI instead of Dr Inventory / Cr GRNI.
   */
  inventoryItemId: string | null;
}

export interface ReceiveTemplate {
  poId: string;
  poNumber: string;
  vendorId: string;
  vendorName: string;
  warehouseId: string | null;
  lines: ReceiveTemplateLine[];
}

export interface ReceiveResult {
  grnId: string;
  grnNo: string;
  totalValue: number;
  lineCount: number;
  newPoStatus: string;
}

export class ReceiveService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
    private readonly userId?: string | null,
  ) {}

  // ─── Template ───────────────────────────────────────────────────────────

  async getTemplate(poId: string): Promise<ReceiveTemplate> {
    const [head] = await this.db
      .select({
        po: purchaseOrdersV2,
        // vendorName via subquery — we don't need the rest of the vendor row
        vendorName: sql<string>`(SELECT name FROM vendors WHERE id = ${purchaseOrdersV2.vendorId})`,
      })
      .from(purchaseOrdersV2)
      .where(and(
        eq(purchaseOrdersV2.id, poId),
        eq(purchaseOrdersV2.tenantId, this.tenantId),
      ))
      .limit(1);
    if (!head) throw new NotFoundError('PurchaseOrder');
    if (!['sent', 'partially_received'].includes(head.po.status)) {
      throw new ConflictError(`PO is ${head.po.status}; cannot receive against it`);
    }

    const lineRows = await this.db
      .select({
        line: purchaseOrderLinesV2,
        catalogId: vendorCatalogItems.id,
        catalogInventoryItemId: vendorCatalogItems.inventoryItemId,
      })
      .from(purchaseOrderLinesV2)
      .leftJoin(
        vendorCatalogItems,
        eq(vendorCatalogItems.id, purchaseOrderLinesV2.catalogItemId),
      )
      .where(eq(purchaseOrderLinesV2.poId, poId))
      .orderBy(purchaseOrderLinesV2.lineNo);

    return {
      poId: head.po.id,
      poNumber: head.po.poNumber,
      vendorId: head.po.vendorId,
      vendorName: head.vendorName ?? '',
      warehouseId: null,
      lines: lineRows
        .map((r) => {
          const ordered = Number(r.line.qtyOrdered);
          const received = Number(r.line.qtyReceived);
          const open = Math.max(0, ordered - received);
          return {
            poLineId: r.line.id,
            lineNo: r.line.lineNo,
            description: r.line.description,
            uom: r.line.uom ?? null,
            hsnSacCode: r.line.hsnSacCode ?? null,
            qtyOrdered: ordered,
            qtyReceivedSoFar: received,
            qtyOpen: open,
            unitRate: Number(r.line.unitRate),
            catalogItemId: r.catalogId ?? null,
            inventoryItemId: r.catalogInventoryItemId ?? null,
          };
        })
        // Hide fully-received lines — keep the template focused on what's open.
        .filter((l) => l.qtyOpen > 0),
    };
  }

  // ─── Receive ────────────────────────────────────────────────────────────

  async receive(poId: string, input: ReceiveAgainstPoInput): Promise<ReceiveResult> {
    // Load PO + lines in one shot for validation + counter updates.
    const [po] = await this.db
      .select()
      .from(purchaseOrdersV2)
      .where(and(eq(purchaseOrdersV2.id, poId), eq(purchaseOrdersV2.tenantId, this.tenantId)))
      .limit(1);
    if (!po) throw new NotFoundError('PurchaseOrder');
    if (!['sent', 'partially_received'].includes(po.status)) {
      throw new ConflictError(`PO is ${po.status}; cannot receive against it`);
    }

    const poLineIds = input.lines.map((l) => l.poLineId);
    const poLines = await this.db
      .select()
      .from(purchaseOrderLinesV2)
      .where(and(
        eq(purchaseOrderLinesV2.tenantId, this.tenantId),
        eq(purchaseOrderLinesV2.poId, poId),
        inArray(purchaseOrderLinesV2.id, poLineIds),
      ));
    const poLineMap = new Map(poLines.map((l) => [l.id, l] as const));
    for (const reqLine of input.lines) {
      if (!poLineMap.has(reqLine.poLineId)) {
        throw new ConflictError(`PO line ${reqLine.poLineId} does not belong to this PO`);
      }
    }

    // Resolve catalog rows. Each one must belong to this PO's vendor +
    // tenant — that's the only access check; the items master is downstream.
    const catalogIds = input.lines.map((l) => l.catalogItemId);
    const catalogRows = await this.db
      .select({
        id: vendorCatalogItems.id,
        vendorId: vendorCatalogItems.vendorId,
        inventoryItemId: vendorCatalogItems.inventoryItemId,
      })
      .from(vendorCatalogItems)
      .where(and(
        eq(vendorCatalogItems.tenantId, this.tenantId),
        inArray(vendorCatalogItems.id, catalogIds),
      ));
    const catalogMap = new Map(catalogRows.map((r) => [r.id, r] as const));
    for (const line of input.lines) {
      const cat = catalogMap.get(line.catalogItemId);
      if (!cat) throw new NotFoundError(`Catalog item ${line.catalogItemId}`);
      if (cat.vendorId !== po.vendorId) {
        throw new ConflictError(`Catalog item ${line.catalogItemId} belongs to a different vendor`);
      }
    }

    // For lines whose catalog row bridges to the items master, validate
    // tracking flags. Lines without a bridge skip stock + serial checks.
    const bridgedItemIds = Array.from(
      new Set(
        input.lines
          .map((l) => catalogMap.get(l.catalogItemId)!.inventoryItemId)
          .filter((id): id is string => !!id),
      ),
    );
    const itemRows = bridgedItemIds.length === 0 ? [] : await this.db
      .select({
        id: itemsTable.id,
        trackInventory: itemsTable.trackInventory,
        trackBatches: itemsTable.trackBatches,
        trackSerials: itemsTable.trackSerials,
        trackExpiry: itemsTable.trackExpiry,
      })
      .from(itemsTable)
      .where(and(
        eq(itemsTable.tenantId, this.tenantId),
        inArray(itemsTable.id, bridgedItemIds),
      ));
    const itemMap = new Map(itemRows.map((r) => [r.id, r] as const));
    for (const line of input.lines) {
      const cat = catalogMap.get(line.catalogItemId)!;
      if (!cat.inventoryItemId) continue;
      const item = itemMap.get(cat.inventoryItemId);
      if (!item) throw new NotFoundError(`Item ${cat.inventoryItemId}`);
      if (!item.trackInventory) {
        throw new ConflictError(`Item ${cat.inventoryItemId} is not stock-tracked`);
      }
      if (item.trackBatches && !line.batchNo) {
        throw new ConflictError(`Item ${cat.inventoryItemId} requires a batch number`);
      }
      if (item.trackExpiry && !line.expiryDate) {
        throw new ConflictError(`Item ${cat.inventoryItemId} requires an expiry date`);
      }
      if (item.trackSerials) {
        const sn = line.serialNos ?? [];
        if (sn.length !== line.qty) {
          throw new ConflictError(
            `Item ${cat.inventoryItemId}: ${sn.length} serial(s) for qty ${line.qty}`,
          );
        }
      }
    }

    // Resolve vendor's expense account once — used as the Dr account for
    // catalog rows that aren't inventory-tracked. Falls back to the system
    // default if the vendor row doesn't override.
    const [vendor] = await this.db
      .select({ expenseAccountCode: vendors.expenseAccountCode })
      .from(vendors)
      .where(eq(vendors.id, po.vendorId))
      .limit(1);
    const expenseAccountCode = vendor?.expenseAccountCode ?? DEFAULT_EXPENSE_ACCOUNT_CODE;

    // Transaction: insert GRN + lines + ledger + serials + JE + counters + status.
    const result = await this.db.transaction(async (tx) => {
      const grnNo = await nextDocNo(tx, this.tenantId, 'GRN');

      let inventoryValue = 0;
      let expenseValue = 0;
      const lineValues = input.lines.map((l) => {
        const poLine = poLineMap.get(l.poLineId)!;
        const unitCost = l.unitCost ?? Number(poLine.unitRate);
        const lineTotal = l.qty * unitCost;
        const cat = catalogMap.get(l.catalogItemId)!;
        if (cat.inventoryItemId) inventoryValue += lineTotal;
        else expenseValue += lineTotal;
        return { unitCost, lineTotal };
      });
      const totalValue = inventoryValue + expenseValue;

      const [grn] = await tx
        .insert(inventoryGrns)
        .values({
          tenantId: this.tenantId,
          grnNo,
          warehouseId: input.warehouseId,
          vendorId: po.vendorId,
          poId,
          source: 'po',
          receivedDate: input.receivedDate,
          vehicleNo: input.vehicleNo ?? null,
          lrNo: input.lrNo ?? null,
          notes: input.notes ?? null,
          status: 'posted',
          postedAt: new Date(),
          totalValue: String(totalValue),
          createdBy: this.userId ?? null,
        })
        .returning();

      const insertedLines = await tx
        .insert(inventoryGrnLines)
        .values(input.lines.map((l, i) => {
          const poLine = poLineMap.get(l.poLineId)!;
          const cat = catalogMap.get(l.catalogItemId)!;
          const { unitCost, lineTotal } = lineValues[i]!;
          return {
            tenantId: this.tenantId,
            grnId: grn!.id,
            // Exactly one of (itemId, catalogItemId) per the CHECK
            // constraint. Bridged catalog rows write item_id to keep
            // existing stock/dashboard joins firing; pure catalog rows
            // write catalog_item_id only.
            itemId: cat.inventoryItemId ?? null,
            catalogItemId: cat.inventoryItemId ? null : l.catalogItemId,
            batchNo: l.batchNo ?? null,
            mfgDate: l.mfgDate ?? null,
            expiryDate: l.expiryDate ?? null,
            qty: String(l.qty),
            uom: poLine.uom ?? null,
            unitRate: String(unitCost),
            landedCostPerUnit: '0',
            lineTotal: String(lineTotal),
            notes: l.notes ?? null,
            serialNos: l.serialNos && l.serialNos.length > 0 ? l.serialNos : null,
            poLineId: l.poLineId,
          };
        }))
        .returning();

      // Stock ledger + serial capture — only for lines that bridge to an
      // inventory-tracked item. Catalog-only lines are pure qty audit.
      const ledger = new StockLedgerService(this.tenantId);
      const receivedDate = new Date(input.receivedDate);
      for (let i = 0; i < input.lines.length; i++) {
        const line = input.lines[i]!;
        const inserted = insertedLines[i]!;
        const cat = catalogMap.get(line.catalogItemId)!;
        if (!cat.inventoryItemId) continue;
        const unitCost = Number(inserted.unitRate);
        await ledger.recordMovement(tx, {
          itemId: cat.inventoryItemId,
          warehouseId: input.warehouseId,
          batchNo: line.batchNo ?? null,
          movementType: 'grn',
          sourceType: 'inventory_grn',
          sourceId: grn!.id,
          sourceLineId: inserted.id,
          qtyDelta: line.qty,
          unitCost,
          movedAt: receivedDate,
          postedBy: this.userId ?? null,
        });
        const sn = line.serialNos ?? [];
        if (sn.length > 0) {
          await tx.insert(inventorySerials).values(
            sn.map((s) => ({
              tenantId: this.tenantId,
              itemId: cat.inventoryItemId!,
              serialNo: s,
              currentWarehouseId: input.warehouseId,
              currentStatus: 'in_stock' as const,
              batchNo: line.batchNo ?? null,
              grnId: grn!.id,
            })),
          );
        }
      }

      // Single JE for the GRN. Mixed Dr (Inventory + Expense) / Cr GRNI when
      // the receive includes a mix of stock-tracked and catalog-only lines.
      const poster = new InventoryGlPoster(tx, this.tenantId, this.userId ?? undefined);
      const jeId = await poster.postPoReceive({
        date: input.receivedDate,
        grnId: grn!.id,
        grnNo: grn!.grnNo,
        inventoryValue,
        expenseValue,
        expenseAccountCode,
      });

      // Backlink the JE on GRN row + ledger rows.
      await tx
        .update(inventoryGrns)
        .set({ journalEntryId: jeId })
        .where(eq(inventoryGrns.id, grn!.id));
      await tx.execute(sql`
        UPDATE stock_ledger SET journal_entry_id = ${jeId}
        WHERE tenant_id = ${this.tenantId}
          AND source_type = 'inventory_grn' AND source_id = ${grn!.id}
      `);

      // Update PO line denormalised counters.
      for (const line of input.lines) {
        await tx
          .update(purchaseOrderLinesV2)
          .set({ qtyReceived: sql`${purchaseOrderLinesV2.qtyReceived}::numeric + ${line.qty}` })
          .where(eq(purchaseOrderLinesV2.id, line.poLineId));
      }

      // Auto-transition PO status. Re-read line counters now they've been
      // updated; sum vs ordered → received | partially_received.
      const refreshedLines = await tx
        .select({ qtyOrdered: purchaseOrderLinesV2.qtyOrdered, qtyReceived: purchaseOrderLinesV2.qtyReceived })
        .from(purchaseOrderLinesV2)
        .where(eq(purchaseOrderLinesV2.poId, poId));
      const allFull = refreshedLines.every((l) => Number(l.qtyReceived) >= Number(l.qtyOrdered));
      const anyReceived = refreshedLines.some((l) => Number(l.qtyReceived) > 0);
      const newStatus = allFull ? 'received' : (anyReceived ? 'partially_received' : po.status);
      if (newStatus !== po.status) {
        await tx
          .update(purchaseOrdersV2)
          .set({ status: newStatus, updatedAt: new Date() })
          .where(eq(purchaseOrdersV2.id, poId));
      }

      return {
        grnId: grn!.id,
        grnNo: grn!.grnNo,
        totalValue,
        lineCount: insertedLines.length,
        newPoStatus: newStatus,
      };
    });

    return result;
  }
}
