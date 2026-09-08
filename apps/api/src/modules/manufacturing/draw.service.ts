/**
 * Manufacturing — draws. Material out now, product recorded later.
 *
 * The floor takes 40 litres "for khoa" and only knows the yield hours later.
 * Until now the first half of that posted as a bare inventory adjustment —
 * three of them account for 63.4 litres on one consignment, with no output, no
 * yield and nothing tying the milk to what it became. A draw is the same two
 * moments, kept joined: take the milk, then say what came out.
 *
 * Underneath it is an ordinary work order with no recipe (see migration 0210),
 * so stock, costing, GL and every report stay single-sourced. The floor never
 * sees the words "work order" or "BOM".
 *
 * Milk is the daily case but nothing here is milk-specific: any raw material
 * or packaging item in the pool draws the same way, so a drum of coconut oil
 * taken for a repack follows this exact path.
 *
 * Batches are chosen by the operator, never FEFO-allocated. They are standing
 * at the tank and can see which can they are pouring from; picking it for them
 * and being wrong writes the wrong consignment into the trail. The screen
 * orders lots soonest-expiry-first as a hint and leaves the choice alone.
 */

import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  items, warehouses, workOrders, woConsumption, woOutput, stockLedger,
} from '@runq/db';
import type { Db } from '@runq/db';
import { ConflictError, NotFoundError, UnprocessableError } from '../../utils/errors';
import { WoConsumptionService } from './consumption.service';
import { WoOutputService } from './output.service';
import { WoLifecycleService } from './wo-lifecycle.service';
import type { DrawRow, DrawYieldHint } from '@runq/types';
import type { CloseDrawInput, OpenDrawInput, TakeMoreInput } from '@runq/validators';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = any;

const MAX_WO_NUMBER_ATTEMPTS = 5;

export class DrawService {
  private readonly consumption: WoConsumptionService;
  private readonly output: WoOutputService;
  private readonly lifecycle: WoLifecycleService;

  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {
    this.consumption = new WoConsumptionService(db, tenantId);
    this.output = new WoOutputService(db, tenantId);
    this.lifecycle = new WoLifecycleService(db, tenantId);
  }

  /**
   * Take material for a product. Opens the draw and posts the first lines.
   *
   * Retried on a work-order number collision the same way `record` does — two
   * operators drawing at once is the ordinary case on a shift change.
   */
  async open(input: OpenDrawInput, userId?: string): Promise<DrawRow> {
    const product = await this.loadProduct(input.outputItemId);
    await this.assertWarehouse(input.warehouseId);

    let lastErr: unknown = null;
    for (let attempt = 0; attempt < MAX_WO_NUMBER_ATTEMPTS; attempt++) {
      try {
        const id = await this.db.transaction(async (tx: Tx) => {
          const woId = await this.insertDraw(tx, input, product, userId);
          await this.lifecycle.startInTx(tx, woId);
          await this.postLines(tx, woId, input.warehouseId, input.lines, userId);
          return woId;
        });
        return this.get(id);
      } catch (err) {
        if (!isWoNumberCollision(err)) throw err;
        lastErr = err;
      }
    }
    throw lastErr;
  }

  /**
   * More material into an open draw — a kettle that got topped up.
   *
   * The yield recorded at the end covers everything that went in, which is why
   * this appends rather than opening a second draw: splitting one kettle into
   * two entries would force the operator to invent a yield for each half.
   */
  async takeMore(id: string, input: TakeMoreInput, userId?: string): Promise<DrawRow> {
    const draw = await this.loadOpenDraw(id);
    await this.db.transaction(async (tx: Tx) => {
      await this.postLines(tx, id, draw.warehouseId, input.lines, userId);
    });
    return this.get(id);
  }

  /**
   * What came out. Posts the output, then completes and closes the run.
   *
   * Closing here rather than leaving it completed is deliberate: "completed"
   * is a state the floor has no screen for and no reason to understand. From
   * their side the kettle is either open or done.
   */
  async close(id: string, input: CloseDrawInput, userId?: string): Promise<DrawRow> {
    const draw = await this.loadOpenDraw(id);
    const product = await this.loadProduct(draw.outputItemId);
    if (product.trackBatches && !input.expiryDate) {
      throw new UnprocessableError(`${product.name} tracks batches — an expiry date is required`);
    }

    const warnings: string[] = [];
    await this.db.transaction(async (tx: Tx) => {
      await this.output.recordInTx(
        tx,
        id,
        {
          outputItemId: product.id,
          batchNo: input.batchNo ?? null,
          warehouseId: draw.warehouseId,
          qty: input.qty,
          uom: draw.outputUom || (product.unit ?? ''),
          expiryDate: input.expiryDate ?? null,
          notes: input.notes ?? null,
          idempotencyKey: null,
        },
        userId,
      );
      await this.lifecycle.completeInTx(tx, id);
      // No plan to deviate from, so variance is meaningless here and is never
      // raised — a draw's whole point is that the yield was unknown.
      await this.lifecycle.closeInTx(
        tx,
        id,
        { varianceAcknowledged: true },
        warnings,
        userId,
      );
    });
    return this.get(id);
  }

  /** Draws, newest first. `openOnly` is what the home screen asks for. */
  async list(openOnly: boolean): Promise<DrawRow[]> {
    const rows = await this.db
      .select({
        id: workOrders.id,
        woNumber: workOrders.woNumber,
        outputItemId: workOrders.outputItemId,
        outputItemName: items.name,
        outputUom: sql<string>`COALESCE(${workOrders.outputUom}, ${items.unit})`,
        // The yield screen needs an expiry field only for products that track
        // batches; the item master is the authority, so it travels with the row
        // rather than being guessed at from the uom.
        outputTracksBatches: items.trackBatches,
        warehouseId: workOrders.warehouseId,
        warehouseName: warehouses.name,
        status: workOrders.status,
        startedAt: sql<string | null>`${workOrders.startedAt}::text`,
        closedAt: sql<string | null>`${workOrders.closedAt}::text`,
        outputQty: workOrders.outputQty,
        notes: sql<string | null>`NULL`,
      })
      .from(workOrders)
      .innerJoin(items, eq(items.id, workOrders.outputItemId))
      .innerJoin(warehouses, eq(warehouses.id, workOrders.warehouseId))
      .where(
        and(
          eq(workOrders.tenantId, this.tenantId),
          // A draw is precisely a run with no recipe behind it.
          isNull(workOrders.bomId),
          openOnly ? eq(workOrders.status, 'in_progress') : undefined,
        ),
      )
      .orderBy(desc(workOrders.startedAt))
      .limit(openOnly ? 50 : 100);

    return this.withDraws(rows);
  }

  async get(id: string): Promise<DrawRow> {
    const all = await this.list(false);
    const found = all.find((d) => d.id === id);
    if (!found) throw new NotFoundError('Draw');
    return found;
  }

  /**
   * What the last closed draw of this product yielded.
   *
   * Not a recipe and never applied — just what happened last time, so the
   * operator entering a khoa yield has "40 litre made 7.2 kg" in front of them
   * instead of a blank field. A ratio the floor never agreed to would be worse
   * than no hint at all.
   */
  async yieldHint(outputItemId: string): Promise<DrawYieldHint | null> {
    // Two plain steps rather than a correlated subquery: find the last closed
    // draw of this product, then total what it drew. The subquery form
    // silently returned nothing, and a hint that quietly fails is worse than
    // one that is simply absent — nobody would notice it had stopped working.
    const [last] = await this.db
      .select({
        id: workOrders.id,
        outputQty: workOrders.outputQty,
        closedAt: sql<string | null>`${workOrders.closedAt}::text`,
      })
      .from(workOrders)
      .where(
        and(
          eq(workOrders.tenantId, this.tenantId),
          eq(workOrders.outputItemId, outputItemId),
          isNull(workOrders.bomId),
          eq(workOrders.status, 'closed'),
          sql`${workOrders.outputQty} > 0`,
        ),
      )
      .orderBy(desc(workOrders.closedAt))
      .limit(1);

    if (!last) return null;

    const [drawn] = await this.db
      .select({
        qty: sql<string>`COALESCE(SUM(${woConsumption.qty}), 0)`,
        uom: sql<string | null>`MIN(${woConsumption.uom})`,
      })
      .from(woConsumption)
      .where(
        and(
          eq(woConsumption.tenantId, this.tenantId),
          eq(woConsumption.woId, last.id),
        ),
      );

    const drawnQty = Number(drawn?.qty ?? 0);
    if (drawnQty <= 0) return null;
    return {
      drawnQty,
      drawnUom: drawn?.uom ?? '',
      outputQty: Number(last.outputQty ?? 0),
      closedAt: last.closedAt,
    };
  }

  // ── internals ───────────────────────────────────────────────────────────

  /**
   * One consumption row per lot the operator chose.
   *
   * Consumption validates each line against that batch's on-hand and refuses
   * an over-draw by name, so a lot that ran out between opening the screen and
   * pressing Take fails loudly instead of quietly pulling from the next can.
   */
  private async postLines(
    tx: Tx,
    woId: string,
    warehouseId: string,
    lines: OpenDrawInput['lines'],
    userId?: string,
  ): Promise<void> {
    for (const line of lines) {
      await this.consumption.recordInTx(
        tx,
        woId,
        {
          bomLineId: null,
          inputItemId: line.inputItemId,
          batchNo: line.batchNo ?? null,
          warehouseId,
          qty: line.qty,
          uom: line.uom,
          notes: null,
          idempotencyKey: null,
        },
        userId,
      );
    }
  }

  private async insertDraw(
    tx: Tx,
    input: OpenDrawInput,
    product: { id: string; unit: string | null },
    userId?: string,
  ): Promise<string> {
    const today = new Date().toISOString().slice(0, 10);
    const [row] = await tx
      .insert(workOrders)
      .values({
        tenantId: this.tenantId,
        woNumber: await this.nextWoNumber(tx, today),
        // No recipe, no version, no plan — the three things a draw does not
        // have and must not pretend to.
        bomId: null,
        bomVersion: null,
        plannedQty: null,
        outputItemId: product.id,
        outputUom: product.unit ?? '',
        warehouseId: input.warehouseId,
        shift: input.shift ?? null,
        scheduledFor: today,
        status: 'draft',
        // A person on the floor took this milk, so it reads as their work
        // rather than as something the machine posted.
        entryMode: 'unplanned',
        createdBy: userId ?? null,
      })
      .returning();
    return row!.id as string;
  }

  /** Milk drawn per lot, folded onto each row. */
  private async withDraws(
    rows: Array<Omit<DrawRow, 'lines' | 'drawnQty' | 'drawnUom' | 'outputQty'> & {
      outputQty: string | number;
    }>,
  ): Promise<DrawRow[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const lines = await this.db
      .select({
        woId: woConsumption.woId,
        inputItemId: woConsumption.inputItemId,
        inputItemName: items.name,
        batchNo: woConsumption.batchNo,
        qty: woConsumption.qty,
        uom: woConsumption.uom,
        at: woConsumption.consumedAt,
      })
      .from(woConsumption)
      .innerJoin(items, eq(items.id, woConsumption.inputItemId))
      .where(
        and(
          eq(woConsumption.tenantId, this.tenantId),
          sql`${woConsumption.woId} = ANY(${sql.raw(`ARRAY['${ids.join("','")}']::uuid[]`)})`,
        ),
      )
      .orderBy(asc(woConsumption.consumedAt));

    // When each lot came into stock. The consumption row only knows when the
    // milk was *drawn*, which on a single draw is the same clock time for
    // every lot and says nothing about which is older — the receipt time is
    // the fact the floor actually reads.
    const receivedAt = await this.receivedAtMap(
      lines.map((l) => ({ itemId: l.inputItemId, batchNo: l.batchNo })),
    );

    return rows.map((r) => {
      const mine = lines.filter((l) => l.woId === r.id);
      return {
        ...r,
        outputQty: Number(r.outputQty ?? 0),
        drawnQty: mine.reduce((s, l) => s + Number(l.qty), 0),
        drawnUom: mine[0]?.uom ?? '',
        lines: mine
            .map((l) => ({
              inputItemId: l.inputItemId,
              inputItemName: l.inputItemName,
              batchNo: l.batchNo,
              qty: Number(l.qty),
              uom: l.uom,
              at: l.at?.toISOString() ?? null,
              receivedAt: receivedAt.get(`${l.inputItemId}|${l.batchNo ?? ''}`) ?? null,
            }))
            // Oldest stock first — the order it should have been drawn in, and
            // the order it reads in on the card.
            .sort((a, b) => (a.receivedAt ?? '').localeCompare(b.receivedAt ?? '')),
      };
    });
  }

  /**
   * Earliest inbound posting per (item, batch) — when the lot landed.
   *
   * Mirrors StockQueryService.batchReceivedMap: `moved_at` carries the
   * business date and is midnight for a milk receipt, so `posted_at` is the
   * only column that can tell two of the same day's lots apart.
   */
  private async receivedAtMap(
    keys: Array<{ itemId: string; batchNo: string | null }>,
  ): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const wanted = keys.filter((k) => k.batchNo);
    if (wanted.length === 0) return out;

    const rows = await this.db
      .select({
        itemId: stockLedger.itemId,
        batchNo: stockLedger.batchNo,
        at: sql<string | null>`MIN(${stockLedger.postedAt})::text`,
      })
      .from(stockLedger)
      .where(
        and(
          eq(stockLedger.tenantId, this.tenantId),
          inArray(stockLedger.itemId, Array.from(new Set(wanted.map((k) => k.itemId)))),
          inArray(stockLedger.batchNo, Array.from(new Set(wanted.map((k) => k.batchNo!)))),
          sql`${stockLedger.qtyIn} > 0`,
        ),
      )
      .groupBy(stockLedger.itemId, stockLedger.batchNo);

    for (const r of rows) {
      if (!r.batchNo || !r.at) continue;
      const d = new Date(r.at);
      if (Number.isNaN(d.getTime())) continue;
      out.set(`${r.itemId}|${r.batchNo}`, d.toISOString());
    }
    return out;
  }

  private async loadOpenDraw(id: string) {
    const draw = await this.get(id);
    if (draw.status !== 'in_progress') {
      throw new ConflictError(
        draw.status === 'closed'
          ? 'This draw is already closed'
          : `Draw is ${draw.status}`,
      );
    }
    return draw;
  }

  private async loadProduct(itemId: string | null) {
    if (!itemId) throw new UnprocessableError('This draw has no product');
    const [row] = await this.db
      .select({
        id: items.id,
        name: items.name,
        unit: items.unit,
        trackBatches: items.trackBatches,
      })
      .from(items)
      .where(and(eq(items.id, itemId), eq(items.tenantId, this.tenantId)))
      .limit(1);
    if (!row) throw new NotFoundError('Item');
    return row;
  }

  private async assertWarehouse(id: string): Promise<void> {
    const [row] = await this.db
      .select({ id: warehouses.id })
      .from(warehouses)
      .where(and(eq(warehouses.id, id), eq(warehouses.tenantId, this.tenantId)))
      .limit(1);
    if (!row) throw new NotFoundError('Warehouse');
  }

  /** Shares the WO number series — a draw is a run and belongs in the sequence. */
  private async nextWoNumber(tx: Tx, producedOn: string): Promise<string> {
    const prefix = `WO-${producedOn.replace(/-/g, '')}-`;
    const [row] = await tx
      .select({
        maxN: sql<number>`COALESCE(MAX(NULLIF(regexp_replace(${workOrders.woNumber}, '^.*-', ''), '')::int), 0)`,
      })
      .from(workOrders)
      .where(
        and(
          eq(workOrders.tenantId, this.tenantId),
          sql`${workOrders.woNumber} ILIKE ${prefix + '%'}`,
        ),
      );
    return `${prefix}${String((row?.maxN ?? 0) + 1).padStart(4, '0')}`;
  }
}

/** Two operators drawing at the same second collide on the WO number. */
function isWoNumberCollision(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('uq_wo_number') || msg.includes('duplicate key');
}
