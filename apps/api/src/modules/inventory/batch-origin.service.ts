/**
 * Where a batch came from.
 *
 * A batch has no master record — it is a `batch_no` string on `stock_on_hand`,
 * and the only trace of its origin is the first inbound `stock_ledger` row's
 * `(source_type, source_id)`. That is enough to reconstruct a provenance line,
 * which is what the raw-milk pool actually needs: `CN-2026-000418` tells a
 * planner nothing, `Indus CC · 28 Aug PM · A2 cow` tells them everything.
 *
 * Resolved on read rather than denormalised into a batch table: the ledger is
 * already the source of truth, and a second copy would need a backfill plus
 * something to keep it in sync.
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '@runq/db';
import {
  stockLedger, items, warehouses, vendors,
  inventoryGrns, inventoryTransfers, inventoryAdjustments, inventoryStockTakes,
  workOrders, mfgReclaims, mfgReclaimLines,
  mpConsignments, mpNodes,
} from '@runq/db';
import type { BatchOrigin, BatchOriginKind } from '@runq/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = any;

export interface BatchKey {
  itemId: string;
  batchNo: string;
}

const round3 = (v: number): number => Math.round(v * 1000) / 1000;

/** `2026-08-28` → `28 Aug`. Batch labels are read on a phone in a plant; the
 *  year is noise on stock that turns over in days. */
const shortDate = (iso: string | null): string | null => {
  if (!iso) return null;
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCDate()} ${d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })}`;
};

/** `production_loss` → `Production loss`. The reason enum is stored in snake
 *  case and is read by people, not code, on a batch row. */
const humanise = (v: string): string =>
  v.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

const MILK_TYPE_LABEL: Record<string, string> = {
  cow: 'Cow',
  buffalo: 'Buffalo',
  mixed: 'Mixed',
  cow_a1: 'A1 cow',
  cow_a2: 'A2 cow',
};

/** Ledger `source_type` → the coarse bucket the UI colours and groups by. */
const KIND_BY_SOURCE: Record<string, BatchOriginKind> = {
  mp_receipt: 'mp_receipt',
  mp_receipt_adjustment: 'mp_receipt',
  mfg_reclaim: 'reclaim',
  inventory_grn: 'grn',
  grn: 'grn',
  work_order: 'production',
  inventory_transfer: 'transfer',
  inventory_adjustment: 'adjustment',
  inventory_stock_take: 'stock_take',
  opening_balance: 'opening',
};

/** One row of the first-inbound scan, before its source document is read. */
interface Seed {
  itemId: string;
  batchNo: string;
  sourceType: string;
  sourceId: string;
  movedAt: Date;
  postedAt: Date;
  receivedQty: number;
  /** Of `receivedQty`, how much the origin document itself put in. */
  originQty: number;
  /** The latest thing to top the batch up after the origin, if anything did. */
  addedAt: Date | null;
}

/** One inbound stock-ledger row, as the first-inbound scan reads it. */
interface InboundRow {
  itemId: string;
  batchNo: string | null;
  sourceType: string;
  sourceId: string;
  movedAt: Date;
  postedAt: Date;
  qtyIn: string;
}

export class BatchOriginService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  /**
   * Provenance for each `(itemId, batchNo)`, keyed `${itemId}|${batchNo}`.
   *
   * Batched by design — callers hold a whole on-hand list, and resolving one
   * batch at a time would be a query per row. Costs one ledger scan plus one
   * lookup per source type actually present.
   */
  async resolve(keys: readonly BatchKey[], exec: Tx = this.db): Promise<Map<string, BatchOrigin>> {
    const out = new Map<string, BatchOrigin>();
    const wanted = keys.filter((k) => k.batchNo);
    if (wanted.length === 0) return out;

    const seeds = await this.firstInbound(exec, wanted);
    if (seeds.length === 0) return out;

    const descriptors = await this.describe(exec, seeds);
    for (const seed of seeds) {
      const key = `${seed.itemId}|${seed.batchNo}`;
      const d = descriptors.get(`${seed.sourceType}|${seed.sourceId}`);
      out.set(key, {
        itemId: seed.itemId,
        batchNo: seed.batchNo,
        kind: KIND_BY_SOURCE[seed.sourceType] ?? 'unknown',
        label: d?.label ?? seed.batchNo,
        detail: d?.detail ?? null,
        sourceDate: d?.sourceDate ?? seed.movedAt.toISOString().slice(0, 10),
        shift: d?.shift ?? null,
        milkType: d?.milkType ?? null,
        sourceRef: d ? { type: seed.sourceType, id: seed.sourceId, no: d.no } : null,
        receivedQty: seed.receivedQty,
        // Anything added to the batch after the movement that opened it. A
        // batch label names one source, so stock topped up from somewhere
        // else is a claim the label cannot carry — 20 L adjusted into a milk
        // consignment made 128 L read as one collection when 108 of it was.
        originQty: seed.originQty,
        addedQty: round3(seed.receivedQty - seed.originQty),
        addedAt: seed.addedAt?.toISOString() ?? null,
        firstInAt: seed.postedAt.toISOString(),
      });
    }
    return out;
  }

  /**
   * The movement that opened each batch, plus everything ever put into it.
   *
   * Inbound rows per batch are a handful (a receipt, maybe a correction), so
   * the pick-the-earliest runs in JS rather than as a `DISTINCT ON` — drizzle
   * expands a JS array inside a raw `sql` template into a comma-list of binds,
   * which breaks `= ANY($1)` (same reason `batchExpiryMap` runs four selects).
   */
  private async firstInbound(exec: Tx, keys: readonly BatchKey[]): Promise<Seed[]> {
    const itemIds = Array.from(new Set(keys.map((k) => k.itemId)));
    const batchNos = Array.from(new Set(keys.map((k) => k.batchNo)));
    const rows = await exec
      .select({
        itemId: stockLedger.itemId,
        batchNo: stockLedger.batchNo,
        sourceType: stockLedger.sourceType,
        sourceId: stockLedger.sourceId,
        movedAt: stockLedger.movedAt,
        postedAt: stockLedger.postedAt,
        qtyIn: stockLedger.qtyIn,
      })
      .from(stockLedger)
      .where(and(
        eq(stockLedger.tenantId, this.tenantId),
        inArray(stockLedger.itemId, itemIds),
        inArray(stockLedger.batchNo, batchNos),
        sql`${stockLedger.qtyIn} > 0`,
      ));

    const wantedKeys = new Set(keys.map((k) => `${k.itemId}|${k.batchNo}`));
    // Grouped first, resolved after: which movement is the origin is only
    // known once every inbound row for the batch has been seen, and the
    // origin decides which of them count towards `originQty`.
    const byKey = new Map<string, InboundRow[]>();
    for (const r of rows) {
      if (!r.batchNo) continue;
      const key = `${r.itemId}|${r.batchNo}`;
      // The item/batch filters are two independent `IN`s, so the scan can
      // return pairs nobody asked for. Drop them rather than describing them.
      if (!wantedKeys.has(key)) continue;
      (byKey.get(key) ?? byKey.set(key, []).get(key)!).push(r);
    }

    const seeds: Seed[] = [];
    for (const inbound of byKey.values()) {
      const origin = inbound.reduce((a, b) => (b.postedAt < a.postedAt ? b : a));
      const later = inbound.filter((r) => r.sourceId !== origin.sourceId);
      seeds.push({
        itemId: origin.itemId,
        batchNo: origin.batchNo!,
        sourceType: origin.sourceType,
        sourceId: origin.sourceId,
        movedAt: origin.movedAt,
        postedAt: origin.postedAt,
        receivedQty: round3(inbound.reduce((sum, r) => sum + Number(r.qtyIn), 0)),
        // Everything the origin document itself put in, including a later
        // correction to that same document — a receipt corrected upward is
        // still that receipt, not a second source.
        originQty: round3(
          inbound
            .filter((r) => r.sourceId === origin.sourceId)
            .reduce((sum, r) => sum + Number(r.qtyIn), 0),
        ),
        addedAt: later.length
          ? later.reduce((a, b) => (b.postedAt > a.postedAt ? b : a)).postedAt
          : null,
      });
    }
    return seeds;
  }

  // ─── Source documents ─────────────────────────────────────────────────

  /** Human descriptor per `${sourceType}|${sourceId}`, one query per type. */
  private async describe(exec: Tx, seeds: readonly Seed[]): Promise<Map<string, Descriptor>> {
    const idsByKind = new Map<BatchOriginKind, string[]>();
    for (const s of seeds) {
      const kind = KIND_BY_SOURCE[s.sourceType] ?? 'unknown';
      const list = idsByKind.get(kind) ?? [];
      list.push(s.sourceId);
      idsByKind.set(kind, list);
    }
    const ids = (kind: BatchOriginKind) => Array.from(new Set(idsByKind.get(kind) ?? []));

    const parts = await Promise.all([
      this.describeMpReceipts(exec, ids('mp_receipt')),
      this.describeReclaims(exec, ids('reclaim')),
      this.describeGrns(exec, ids('grn')),
      this.describeProduction(exec, ids('production')),
      this.describeTransfers(exec, ids('transfer')),
      this.describeAdjustments(exec, ids('adjustment')),
      this.describeStockTakes(exec, ids('stock_take')),
    ]);

    // Keyed by source id alone inside each part; re-key by type+id so two
    // source types can never collide on a shared uuid.
    const out = new Map<string, Descriptor>();
    for (const s of seeds) {
      for (const part of parts) {
        const d = part.get(s.sourceId);
        if (d) out.set(`${s.sourceType}|${s.sourceId}`, d);
      }
      if (s.sourceType === 'opening_balance' && !out.has(`${s.sourceType}|${s.sourceId}`)) {
        out.set(`${s.sourceType}|${s.sourceId}`, {
          label: 'Opening balance', detail: null, sourceDate: null,
          shift: null, milkType: null, no: null,
        });
      }
    }
    return out;
  }

  /**
   * Raw milk taken in at the plant. The label a dairy planner actually reads:
   * which centre it came from, which collection it belongs to, what kind of
   * milk it is — `Indus CC · 28 Aug PM · A2 cow`.
   */
  private async describeMpReceipts(exec: Tx, sourceIds: string[]): Promise<Map<string, Descriptor>> {
    const out = new Map<string, Descriptor>();
    if (sourceIds.length === 0) return out;
    const rows = await exec
      .select({
        id: mpConsignments.id,
        no: mpConsignments.consignmentNo,
        date: mpConsignments.collectionDate,
        shift: mpConsignments.shift,
        milkType: mpConsignments.milkType,
        containerNo: mpConsignments.containerNo,
        fat: mpConsignments.receiptFat,
        snf: mpConsignments.receiptSnf,
        nodeName: mpNodes.name,
      })
      .from(mpConsignments)
      .leftJoin(mpNodes, eq(mpNodes.id, mpConsignments.fromNodeId))
      .where(and(
        eq(mpConsignments.tenantId, this.tenantId),
        inArray(mpConsignments.id, sourceIds),
      ));

    for (const r of rows) {
      const bits = [
        r.nodeName ?? 'Milk intake',
        [shortDate(r.date), r.shift ? r.shift.toUpperCase() : null].filter(Boolean).join(' '),
        r.milkType ? MILK_TYPE_LABEL[r.milkType] ?? r.milkType : null,
      ].filter((b) => b && b.length > 0);
      const qc = [
        r.fat != null ? `${Number(r.fat)} fat` : null,
        r.snf != null ? `${Number(r.snf)} SNF` : null,
      ].filter(Boolean).join(' / ');
      out.set(r.id, {
        label: bits.join(' · '),
        detail: [r.containerNo ? `Tanker ${r.containerNo}` : null, qc || null]
          .filter(Boolean).join(' · ') || null,
        sourceDate: r.date,
        shift: r.shift ?? null,
        milkType: r.milkType ?? null,
        no: r.no,
      });
    }
    return out;
  }

  /**
   * Milk poured back out of packets. Short-dated by definition, and the one
   * origin a planner must not mistake for fresh intake — so the label leads
   * with what was cut open.
   */
  private async describeReclaims(exec: Tx, sourceIds: string[]): Promise<Map<string, Descriptor>> {
    const out = new Map<string, Descriptor>();
    if (sourceIds.length === 0) return out;
    const rows = await exec
      .select({
        id: mfgReclaims.id,
        no: mfgReclaims.reclaimNo,
        date: mfgReclaims.reclaimDate,
        fgName: items.name,
        fgBatchNo: mfgReclaimLines.fgBatchNo,
      })
      .from(mfgReclaims)
      .leftJoin(mfgReclaimLines, eq(mfgReclaimLines.reclaimId, mfgReclaims.id))
      .leftJoin(items, eq(items.id, mfgReclaimLines.fgItemId))
      .where(and(eq(mfgReclaims.tenantId, this.tenantId), inArray(mfgReclaims.id, sourceIds)));

    for (const r of rows) {
      // A reclaim can tear down several finished goods at once; the first line
      // read names the batch, and `detail` carries the document for the rest.
      if (out.has(r.id)) continue;
      const from = [r.fgName, r.fgBatchNo].filter(Boolean).join(' ');
      out.set(r.id, {
        label: from ? `Reclaimed · ${from}` : 'Reclaimed stock',
        detail: [r.no, shortDate(r.date)].filter(Boolean).join(' · ') || null,
        sourceDate: r.date,
        shift: null,
        milkType: null,
        no: r.no,
      });
    }
    return out;
  }

  private async describeGrns(exec: Tx, sourceIds: string[]): Promise<Map<string, Descriptor>> {
    const out = new Map<string, Descriptor>();
    if (sourceIds.length === 0) return out;
    const rows = await exec
      .select({
        id: inventoryGrns.id,
        no: inventoryGrns.grnNo,
        date: inventoryGrns.receivedDate,
        vendorName: vendors.name,
      })
      .from(inventoryGrns)
      .leftJoin(vendors, eq(vendors.id, inventoryGrns.vendorId))
      .where(and(eq(inventoryGrns.tenantId, this.tenantId), inArray(inventoryGrns.id, sourceIds)));

    for (const r of rows) {
      out.set(r.id, {
        label: r.vendorName ? `${r.vendorName} · ${shortDate(r.date) ?? r.no}` : `Received · ${r.no}`,
        detail: r.no,
        sourceDate: r.date,
        shift: null,
        milkType: null,
        no: r.no,
      });
    }
    return out;
  }

  private async describeProduction(exec: Tx, sourceIds: string[]): Promise<Map<string, Descriptor>> {
    const out = new Map<string, Descriptor>();
    if (sourceIds.length === 0) return out;
    const rows = await exec
      .select({
        id: workOrders.id,
        no: workOrders.woNumber,
        date: workOrders.scheduledFor,
      })
      .from(workOrders)
      .where(and(eq(workOrders.tenantId, this.tenantId), inArray(workOrders.id, sourceIds)));

    for (const r of rows) {
      out.set(r.id, {
        label: `Made in-house · ${shortDate(r.date) ?? r.no}`,
        detail: r.no,
        sourceDate: r.date,
        shift: null,
        milkType: null,
        no: r.no,
      });
    }
    return out;
  }

  private async describeTransfers(exec: Tx, sourceIds: string[]): Promise<Map<string, Descriptor>> {
    const out = new Map<string, Descriptor>();
    if (sourceIds.length === 0) return out;
    const rows = await exec
      .select({
        id: inventoryTransfers.id,
        no: inventoryTransfers.transferNo,
        date: inventoryTransfers.receivedAt,
        fromName: warehouses.name,
      })
      .from(inventoryTransfers)
      .leftJoin(warehouses, eq(warehouses.id, inventoryTransfers.fromWarehouseId))
      .where(and(
        eq(inventoryTransfers.tenantId, this.tenantId),
        inArray(inventoryTransfers.id, sourceIds),
      ));

    for (const r of rows) {
      out.set(r.id, {
        label: r.fromName ? `Moved from ${r.fromName}` : 'Transferred in',
        detail: [r.no, shortDate(r.date)].filter(Boolean).join(' · ') || null,
        sourceDate: r.date,
        shift: null,
        milkType: null,
        no: r.no,
      });
    }
    return out;
  }

  private async describeAdjustments(exec: Tx, sourceIds: string[]): Promise<Map<string, Descriptor>> {
    const out = new Map<string, Descriptor>();
    if (sourceIds.length === 0) return out;
    const rows = await exec
      .select({
        id: inventoryAdjustments.id,
        no: inventoryAdjustments.adjNo,
        date: inventoryAdjustments.adjustmentDate,
        reason: inventoryAdjustments.reason,
      })
      .from(inventoryAdjustments)
      .where(and(
        eq(inventoryAdjustments.tenantId, this.tenantId),
        inArray(inventoryAdjustments.id, sourceIds),
      ));

    for (const r of rows) {
      out.set(r.id, {
        label: r.reason ? `Adjusted in · ${humanise(r.reason)}` : 'Adjusted in',
        detail: [r.no, shortDate(r.date)].filter(Boolean).join(' · ') || null,
        sourceDate: r.date,
        shift: null,
        milkType: null,
        no: r.no,
      });
    }
    return out;
  }

  private async describeStockTakes(exec: Tx, sourceIds: string[]): Promise<Map<string, Descriptor>> {
    const out = new Map<string, Descriptor>();
    if (sourceIds.length === 0) return out;
    const rows = await exec
      .select({
        id: inventoryStockTakes.id,
        no: inventoryStockTakes.stNo,
        date: inventoryStockTakes.completedAt,
      })
      .from(inventoryStockTakes)
      .where(and(
        eq(inventoryStockTakes.tenantId, this.tenantId),
        inArray(inventoryStockTakes.id, sourceIds),
      ));

    for (const r of rows) {
      out.set(r.id, {
        label: `Counted in · ${shortDate(r.date) ?? r.no}`,
        detail: r.no,
        sourceDate: r.date,
        shift: null,
        milkType: null,
        no: r.no,
      });
    }
    return out;
  }
}

interface Descriptor {
  label: string;
  detail: string | null;
  sourceDate: string | null;
  shift: 'am' | 'pm' | null;
  milkType: string | null;
  no: string | null;
}
