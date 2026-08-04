/**
 * Manufacturing — Reclaim (finished goods torn back down to raw material).
 *
 * Unsold packets get cut open and the milk goes back into the pool for paneer
 * or curd. See packages/db/src/schema/manufacturing/reclaims.ts for why this
 * is not modelled as a reverse-BOM work order.
 *
 * Valuation, per line:
 *   fgValue        = fgQty x the FG batch's weighted-average cost (from the
 *                    ledger, same as any other outbound)
 *   recoveredValue = recoveredQty x min(raw-material pooled WAC,
 *                                       fgValue / recoveredQty)
 *   loss           = fgValue - recoveredValue   -> written off
 *
 * The cap is what stops a teardown from inventing value: a cheap FG batch
 * meeting an expensive raw-material pool would otherwise post a gain and lift
 * the balance sheet for cutting packets open.
 */

import { and, asc, count, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Db } from '@runq/db';
import {
  mfgReclaims, mfgReclaimLines, items, warehouses, boms, bomLines,
} from '@runq/db';
import type { CancelReclaimInput, CreateReclaimInput, ReclaimFilter } from '@runq/validators';
import { AppError, ConflictError, NotFoundError, UnprocessableError } from '../../utils/errors';
import { StockLedgerService } from '../inventory/stock-ledger.service';
import { nextDocNo } from '../inventory/sequence';
import { ManufacturingGlPoster } from './gl-poster';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = any;

interface ReclaimLineRow {
  l: typeof mfgReclaimLines.$inferSelect;
  fgItemName: string;
  fgItemSku: string;
  recoveredItemName: string;
  recoveredItemSku: string;
  recoveredUom: string | null;
  recoveredTracksBatches: boolean | null;
}

interface LineTotals {
  fgUnitCost: number;
  fgValue: number;
  recoveredUnitCost: number;
  recoveredValue: number;
}

export interface PostReclaimResult {
  data: typeof mfgReclaims.$inferSelect;
  warnings: string[];
}

export class ReclaimService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
    private readonly userId?: string,
  ) {}

  async list(filter: ReclaimFilter) {
    const conds = [eq(mfgReclaims.tenantId, this.tenantId)];
    if (filter.status) conds.push(eq(mfgReclaims.status, filter.status));
    if (filter.warehouseId) conds.push(eq(mfgReclaims.warehouseId, filter.warehouseId));
    if (filter.from) conds.push(gte(mfgReclaims.reclaimDate, filter.from));
    if (filter.to) conds.push(lte(mfgReclaims.reclaimDate, filter.to));
    const where = and(...conds)!;

    const [rows, [totals]] = await Promise.all([
      this.db
        .select({ r: mfgReclaims, warehouseName: warehouses.name })
        .from(mfgReclaims)
        .innerJoin(warehouses, eq(warehouses.id, mfgReclaims.warehouseId))
        .where(where)
        .orderBy(desc(mfgReclaims.reclaimDate), desc(mfgReclaims.createdAt))
        .limit(filter.limit)
        .offset((filter.page - 1) * filter.limit),
      this.db.select({ total: count() }).from(mfgReclaims).where(where),
    ]);

    const total = totals?.total ?? 0;
    return {
      data: rows.map((r) => ({ ...r.r, warehouseName: r.warehouseName })),
      page: filter.page,
      limit: filter.limit,
      total,
      totalPages: Math.ceil(total / filter.limit),
    };
  }

  async get(id: string) {
    const [row] = await this.db
      .select({ r: mfgReclaims, warehouseName: warehouses.name })
      .from(mfgReclaims)
      .innerJoin(warehouses, eq(warehouses.id, mfgReclaims.warehouseId))
      .where(and(eq(mfgReclaims.id, id), eq(mfgReclaims.tenantId, this.tenantId)))
      .limit(1);
    if (!row) throw new NotFoundError('Reclaim');
    return { ...row.r, warehouseName: row.warehouseName, lines: await this.loadLines(this.db, id) };
  }

  async create(input: CreateReclaimInput) {
    if (input.idempotencyKey) {
      const existing = await this.findByIdempotencyKey(input.idempotencyKey);
      if (existing) return existing;
    }
    return this.db.transaction(async (tx: Tx) => {
      const reclaimNo = await nextDocNo(tx, this.tenantId, 'RCL');
      const [r] = await tx
        .insert(mfgReclaims)
        .values({
          tenantId: this.tenantId,
          reclaimNo,
          warehouseId: input.warehouseId,
          reclaimDate: input.reclaimDate,
          notes: input.notes ?? null,
          idempotencyKey: input.idempotencyKey ?? null,
          createdBy: this.userId ?? null,
        })
        .returning();

      const resolved = await this.resolveLines(tx, input, reclaimNo);
      await tx.insert(mfgReclaimLines).values(
        resolved.map((l) => ({ ...l, tenantId: this.tenantId, reclaimId: r!.id })),
      );
      return r!;
    });
  }

  /**
   * Fill in everything the technician shouldn't have to type.
   *
   * The mobile teardown screen sends a packet count and a destination. The FG's
   * own BOM, read backwards, says which raw material comes out and how much per
   * packet; the batch number and expiry are generated. Anything the caller did
   * supply wins, so the detailed web form is unaffected.
   */
  private async resolveLines(tx: Tx, input: CreateReclaimInput, reclaimNo: string) {
    const needsBom = input.lines.filter((l) => !l.recoveredItemId || l.recoveredQty == null);
    const bomByFgItem = needsBom.length > 0
      ? await this.reverseBomMap(tx, needsBom.map((l) => l.fgItemId))
      : new Map<string, { inputItemId: string; perUnit: number }>();

    return input.lines.map((l, idx) => {
      const bom = bomByFgItem.get(l.fgItemId);
      const recoveredItemId = l.recoveredItemId ?? bom?.inputItemId;
      if (!recoveredItemId) {
        throw new UnprocessableError(
          'No active BOM found for this product — pick the recovered material explicitly',
        );
      }
      const recoveredQty = l.recoveredQty ?? round3(l.fgQty * (bom?.perUnit ?? 0));
      if (recoveredQty <= 0) {
        throw new UnprocessableError(
          'Recovered quantity works out to zero — check the BOM or enter it by hand',
        );
      }
      return {
        fgItemId: l.fgItemId,
        fgBatchNo: l.fgBatchNo ?? null,
        fgQty: String(l.fgQty),
        recoveredItemId,
        // Line index keeps batches unique when one teardown opens two products
        // into the same raw pool.
        recoveredBatchNo:
          l.recoveredBatchNo ?? `${reclaimNo}-${String(idx + 1).padStart(2, '0')}`,
        recoveredQty: String(recoveredQty),
        // Reclaimed material has already spent time in a pack — default it to
        // same-day so FEFO draws it before anything fresh.
        expiryDate: l.expiryDate ?? input.reclaimDate,
        destinationItemId: l.destinationItemId ?? null,
        notes: l.notes ?? null,
      };
    });
  }

  /**
   * FG item -> the single raw material its BOM consumes, and how much per unit
   * of output. Recipes drawing on more than one raw material are left out:
   * splitting a torn-down pack across two inputs is a judgement call.
   */
  private async reverseBomMap(
    tx: Tx,
    fgItemIds: string[],
  ): Promise<Map<string, { inputItemId: string; perUnit: number }>> {
    const rows = await tx
      .select({
        fgItemId: boms.outputItemId,
        inputItemId: bomLines.inputItemId,
        perUnit: sql<string>`${bomLines.qtyPerOutput} / NULLIF(${boms.outputQty}, 0)`,
      })
      .from(boms)
      .innerJoin(bomLines, eq(bomLines.bomId, boms.id))
      .innerJoin(items, eq(items.id, bomLines.inputItemId))
      .where(
        and(
          eq(boms.tenantId, this.tenantId),
          eq(boms.isActive, true),
          eq(items.itemClass, 'raw_material'),
          sql`${boms.outputItemId} IN (${sql.join(fgItemIds.map((id) => sql`${id}`), sql`, `)})`,
        ),
      );

    const seen = new Map<string, { inputItemId: string; perUnit: number }>();
    const ambiguous = new Set<string>();
    for (const r of rows as Array<{ fgItemId: string; inputItemId: string; perUnit: string }>) {
      if (seen.has(r.fgItemId)) ambiguous.add(r.fgItemId);
      seen.set(r.fgItemId, { inputItemId: r.inputItemId, perUnit: Number(r.perUnit) });
    }
    for (const id of ambiguous) seen.delete(id);
    return seen;
  }

  /**
   * Post the teardown. Both stock legs, the write-off and the status flip run
   * in one transaction — a failure part-way must never leave finished goods
   * consumed with no raw material to show for it.
   */
  async post(id: string): Promise<PostReclaimResult> {
    const warnings: string[] = [];
    const data = await this.db.transaction((tx: Tx) => this.postInTx(tx, id, warnings));
    return { data, warnings };
  }

  private async postInTx(tx: Tx, id: string, warnings: string[]) {
    const [r] = await tx
      .select()
      .from(mfgReclaims)
      .where(and(eq(mfgReclaims.id, id), eq(mfgReclaims.tenantId, this.tenantId)))
      .limit(1);
    if (!r) throw new NotFoundError('Reclaim');
    if (r.status !== 'draft') throw new ConflictError(`Reclaim is ${r.status}`);

    const lines = await this.loadLines(tx, id);
    if (lines.length === 0) throw new AppError(400, 'No lines to post');

    const ledger = new StockLedgerService(this.tenantId);
    const movedAt = new Date(r.reclaimDate);
    let fgTotal = 0;
    let recoveredTotal = 0;

    for (const line of lines) {
      await this.checkYield(tx, line, warnings);
      const totals = await this.postLine(tx, ledger, r, line, movedAt);
      fgTotal += totals.fgValue;
      recoveredTotal += totals.recoveredValue;
      await tx
        .update(mfgReclaimLines)
        .set({
          fgUnitCost: String(totals.fgUnitCost),
          fgValue: String(totals.fgValue),
          recoveredUnitCost: String(totals.recoveredUnitCost),
          recoveredValue: String(totals.recoveredValue),
        })
        .where(eq(mfgReclaimLines.id, line.id));
    }

    const lossValue = round2(fgTotal - recoveredTotal);
    const poster = new ManufacturingGlPoster(tx, this.tenantId, this.userId);
    const jeId = await poster.postReclaim({
      date: r.reclaimDate,
      reclaimId: r.id,
      reclaimNo: r.reclaimNo,
      lossValue,
    });

    const [updated] = await tx
      .update(mfgReclaims)
      .set({
        status: 'posted',
        fgValue: String(round2(fgTotal)),
        recoveredValue: String(round2(recoveredTotal)),
        lossValue: String(lossValue),
        journalEntryId: jeId,
        postedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(mfgReclaims.id, id))
      .returning();

    if (jeId) {
      await tx.execute(sql`
        UPDATE stock_ledger SET journal_entry_id = ${jeId}
        WHERE tenant_id = ${this.tenantId}
          AND source_type = 'mfg_reclaim' AND source_id = ${r.id}
      `);
    }
    return updated!;
  }

  /** FG out at its batch WAC, raw material in at the capped pooled WAC. */
  private async postLine(
    tx: Tx,
    ledger: StockLedgerService,
    reclaim: typeof mfgReclaims.$inferSelect,
    line: Awaited<ReturnType<ReclaimService['loadLines']>>[number],
    movedAt: Date,
  ): Promise<LineTotals> {
    const fgQty = Number(line.fgQty);
    const recoveredQty = Number(line.recoveredQty);

    if (line.recoveredTracksBatches && !line.expiryDate) {
      throw new UnprocessableError(
        `${line.recoveredItemName} tracks batches — reclaimed stock needs an expiry date`,
      );
    }

    const out = await ledger.recordMovement(tx, {
      itemId: line.fgItemId,
      warehouseId: reclaim.warehouseId,
      batchNo: line.fgBatchNo ?? null,
      movementType: 'reclaim_out',
      sourceType: 'mfg_reclaim',
      sourceId: reclaim.id,
      sourceLineId: line.id,
      qtyDelta: -fgQty,
      movedAt,
      postedBy: this.userId ?? null,
    });

    const fgValue = round2(fgQty * out.unitCostUsed);
    // Cap: the recovered material cannot be worth more than the finished goods
    // given up for it. Without this a cheap FG batch meeting an expensive raw
    // pool would post a gain for cutting packets open.
    //
    // A zero pooled cost means "we don't know what this material is worth", not
    // "it is free" — milk-procurement consignments post zero-valued batches, so
    // the raw pool reads 0 on a dairy that has never priced its intake. Writing
    // the whole FG cost off against that would be a fiction; carrying it across
    // conserves cost and leaves the value where it actually still is.
    const pooledCost = await this.pooledUnitCost(tx, line.recoveredItemId, reclaim.warehouseId);
    const capPerUnit = recoveredQty > 0 ? fgValue / recoveredQty : 0;
    const recoveredUnitCost = pooledCost > 0 ? Math.min(pooledCost, capPerUnit) : capPerUnit;

    await ledger.recordMovement(tx, {
      itemId: line.recoveredItemId,
      warehouseId: reclaim.warehouseId,
      batchNo: line.recoveredBatchNo ?? null,
      movementType: 'reclaim_in',
      sourceType: 'mfg_reclaim',
      sourceId: reclaim.id,
      sourceLineId: line.id,
      qtyDelta: recoveredQty,
      unitCost: recoveredUnitCost,
      movedAt,
      postedBy: this.userId ?? null,
    });

    return {
      fgUnitCost: out.unitCostUsed,
      fgValue,
      recoveredUnitCost,
      recoveredValue: round2(recoveredQty * recoveredUnitCost),
    };
  }

  /**
   * Weighted-average cost for an item across every batch in the warehouse.
   *
   * Deliberately NOT left to the ledger's own inbound fallback: that reads the
   * on-hand row for the specific batch, and a reclaim always writes a brand-new
   * batch with no history — it would fall through to items.cost_price and
   * quietly value reclaimed milk at the master rate instead of the real pool.
   *
   * Returns 0 for "unknown", which covers both an empty pool and a pool that
   * exists but carries no value (zero-valued milk-procurement batches). The
   * caller decides what to do with that rather than treating it as free.
   */
  private async pooledUnitCost(tx: Tx, itemId: string, warehouseId: string): Promise<number> {
    const result = await tx.execute(sql`
      SELECT COALESCE(SUM(value), 0)::text AS value, COALESCE(SUM(qty), 0)::text AS qty
      FROM stock_on_hand
      WHERE tenant_id = ${this.tenantId}
        AND item_id = ${itemId}
        AND warehouse_id = ${warehouseId}
        AND qty > 0
    `);
    const row = (result as { rows: Array<{ value: string; qty: string }> }).rows[0];
    const qty = Number(row?.qty ?? 0);
    const pooled = qty > 0 ? Number(row?.value ?? 0) / qty : 0;
    if (pooled > 0) return pooled;

    // No pool, or an unvalued one — fall back to the item master so a tenant
    // that prices its materials still gets a real number.
    const [item] = await tx
      .select({ costPrice: items.costPrice })
      .from(items)
      .where(and(eq(items.id, itemId), eq(items.tenantId, this.tenantId)))
      .limit(1);
    return Number(item?.costPrice ?? 0);
  }

  /**
   * Warn (never block) when the operator claims back more material than the
   * BOM says was in the packets. Getting 51 L out of 100 x 500ml is a typo, but
   * the floor still needs to record what physically happened.
   */
  private async checkYield(
    tx: Tx,
    line: Awaited<ReturnType<ReclaimService['loadLines']>>[number],
    warnings: string[],
  ): Promise<void> {
    const [row] = await tx
      .select({ qtyPerOutput: bomLines.qtyPerOutput, outputQty: boms.outputQty })
      .from(bomLines)
      .innerJoin(boms, eq(boms.id, bomLines.bomId))
      .where(
        and(
          eq(boms.tenantId, this.tenantId),
          eq(boms.isActive, true),
          eq(boms.outputItemId, line.fgItemId),
          eq(bomLines.inputItemId, line.recoveredItemId),
        ),
      )
      .limit(1);
    if (!row) return;

    const perOutput = Number(row.outputQty) > 0
      ? Number(row.qtyPerOutput) / Number(row.outputQty)
      : 0;
    const theoretical = perOutput * Number(line.fgQty);
    if (theoretical > 0 && Number(line.recoveredQty) > theoretical) {
      warnings.push(
        `${line.recoveredItemName}: recovered ${line.recoveredQty} but ${line.fgQty} `
        + `${line.fgItemName} only contains about ${round2(theoretical)} — check the quantity`,
      );
    }
  }

  async cancel(id: string, input: CancelReclaimInput) {
    const [row] = await this.db
      .select({ status: mfgReclaims.status, notes: mfgReclaims.notes })
      .from(mfgReclaims)
      .where(and(eq(mfgReclaims.id, id), eq(mfgReclaims.tenantId, this.tenantId)))
      .limit(1);
    if (!row) throw new NotFoundError('Reclaim');
    if (row.status === 'cancelled') throw new ConflictError('Already cancelled');
    if (row.status === 'posted') {
      throw new ConflictError(
        'Posted reclaims cannot be cancelled — record a counter-reclaim instead',
      );
    }
    const [u] = await this.db
      .update(mfgReclaims)
      .set({
        status: 'cancelled',
        cancelledAt: new Date(),
        notes: row.notes ? `${row.notes}\n[Cancelled] ${input.reason}` : `[Cancelled] ${input.reason}`,
        updatedAt: new Date(),
      })
      .where(eq(mfgReclaims.id, id))
      .returning();
    return u!;
  }

  // ─── Loads ────────────────────────────────────────────────────────────

  private async loadLines(exec: Tx, reclaimId: string) {
    const fg = alias(items, 'fg_item');
    const rec = alias(items, 'recovered_item');
    const rows = await exec
      .select({
        l: mfgReclaimLines,
        fgItemName: fg.name,
        fgItemSku: fg.sku,
        recoveredItemName: rec.name,
        recoveredItemSku: rec.sku,
        recoveredUom: rec.unit,
        recoveredTracksBatches: rec.trackBatches,
      })
      .from(mfgReclaimLines)
      .innerJoin(fg, eq(fg.id, mfgReclaimLines.fgItemId))
      .innerJoin(rec, eq(rec.id, mfgReclaimLines.recoveredItemId))
      .where(eq(mfgReclaimLines.reclaimId, reclaimId))
      .orderBy(asc(mfgReclaimLines.id));

    return rows.map((r: ReclaimLineRow) => ({
      ...r.l,
      fgItemName: r.fgItemName,
      fgItemSku: r.fgItemSku,
      recoveredItemName: r.recoveredItemName,
      recoveredItemSku: r.recoveredItemSku,
      recoveredUom: r.recoveredUom ?? '',
      recoveredTracksBatches: r.recoveredTracksBatches ?? false,
    }));
  }

  private async findByIdempotencyKey(key: string) {
    const [row] = await this.db
      .select()
      .from(mfgReclaims)
      .where(and(eq(mfgReclaims.tenantId, this.tenantId), eq(mfgReclaims.idempotencyKey, key)))
      .limit(1);
    return row ?? null;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
