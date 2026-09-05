import { and, asc, desc, eq, gte, lte, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Db } from '@runq/db';
import {
  stockOnHand, stockLedger, items, warehouses, inventoryGrnLines,
  woOutput, mfgReclaimLines, categories,
} from '@runq/db';
import type { StockOnHandFilter, StockLedgerFilter } from '@runq/validators';
import { ITEM_CLASS_GROUP_MEMBERS } from '@runq/validators';
import { NotFoundError } from '../../utils/errors';
import { BatchOriginService } from './batch-origin.service';

/** `YYYY-MM-DD` plus n whole days, in UTC so a shelf life never loses a day to
 *  the server's timezone. */
const addDays = (date: string, n: number): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** The shape `decorateBatches` needs — every stock row it enriches has these. */
interface DecoratableRow {
  itemId: string;
  batchNo: string;
  qty: string | number;
  avgCost: string | number;
  value: string | number;
  reorderLevel?: string | number | null;
}

/** FEFO order for a batch list: soonest expiry first, undated last, oldest
 *  intake breaking the tie. Undated stock sorts last rather than first — an
 *  unknown date is not a fresh one, and putting it on top would send a run at
 *  the batch nobody has dated instead of the one about to turn. */
const compareByUrgency = (
  a: { expiryDate: string | null; receivedAt: string | null },
  b: { expiryDate: string | null; receivedAt: string | null },
): number => {
  if (a.expiryDate !== b.expiryDate) {
    if (!a.expiryDate) return 1;
    if (!b.expiryDate) return -1;
    return a.expiryDate < b.expiryDate ? -1 : 1;
  }
  return (a.receivedAt ?? '').localeCompare(b.receivedAt ?? '');
};

// Leaf category and its parent. Aliased because both come from `categories`.
const category = alias(categories, 'item_category');
const parentCategory = alias(categories, 'item_category_parent');

export class StockQueryService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  async onHand(filter: StockOnHandFilter) {
    const conds = [
      eq(stockOnHand.tenantId, this.tenantId),
      sql`${stockOnHand.qty} <> 0`,
    ];
    if (filter.warehouseId) conds.push(eq(stockOnHand.warehouseId, filter.warehouseId));
    if (filter.itemId) conds.push(eq(stockOnHand.itemId, filter.itemId));
    // Axis-1 grouping: tab strips on the mobile/web on-hand screens pass
    // a bucket like 'finished' or 'inputs'; we expand to the underlying
    // item_class values. 'all' falls through and applies no filter.
    if (filter.itemClassGroup && filter.itemClassGroup !== 'all') {
      const classes = ITEM_CLASS_GROUP_MEMBERS[filter.itemClassGroup];
      if (classes.length > 0) conds.push(inArray(items.itemClass, [...classes]));
    }

    const rows = await this.db
      .select({
        itemId: stockOnHand.itemId,
        warehouseId: stockOnHand.warehouseId,
        batchNo: stockOnHand.batchNo,
        qty: stockOnHand.qty,
        avgCost: stockOnHand.avgCost,
        value: stockOnHand.value,
        lastMovementAt: stockOnHand.lastMovementAt,
        itemName: items.name,
        itemSku: items.sku,
        itemUnit: items.unit,
        itemClass: items.itemClass,
        reorderLevel: items.reorderLevel,
        warehouseName: warehouses.name,
        // Axis-2 category tree. `items.category_id` points at the leaf, so the
        // self-join walks one level up for its parent. A leaf with no parent is
        // itself a top-level category — callers grouping by category then
        // sub-category should treat `categoryGroup` as the heading and fall
        // back to the leaf when the two are equal.
        categoryName: category.name,
        categoryGroup: parentCategory.name,
        // Set on the category the shop floor works out of, and inherited one
        // level down so flagging the group covers its leaves. Manufacturing's
        // home card leads with these and hides the rest behind "See all".
        categoryIsPrimaryInput: sql<boolean>`COALESCE(${category.isPrimaryInput}, false)
          OR COALESCE(${parentCategory.isPrimaryInput}, false)`,
      })
      .from(stockOnHand)
      .innerJoin(items, eq(items.id, stockOnHand.itemId))
      .innerJoin(warehouses, eq(warehouses.id, stockOnHand.warehouseId))
      .leftJoin(category, eq(category.id, items.categoryId))
      .leftJoin(parentCategory, eq(parentCategory.id, category.parentId))
      .where(and(...conds))
      .orderBy(asc(items.name), asc(warehouses.name));

    const filtered = filter.lowOnly
      ? rows.filter((r) => r.reorderLevel != null && Number(r.qty) <= Number(r.reorderLevel))
      : rows;
    return this.decorateBatches(filtered);
  }

  /**
   * Add the per-batch facts `stock_on_hand` does not carry: when the batch
   * landed, when it expires, and where it came from. Three batched lookups
   * rather than a join, so a tenant with no batches pays nothing.
   */
  private async decorateBatches<T extends DecoratableRow>(rows: readonly T[]) {
    const keys = rows
      .filter((r) => r.batchNo)
      .map((r) => ({ itemId: r.itemId, batchNo: r.batchNo }));
    const [expiryMap, receivedMap, originMap] = await Promise.all([
      // Expiry is not on stock_on_hand — GRN lines, WO output and reclaim
      // lines are the source of truth, with shelf life filling the gap.
      this.batchExpiryMap(keys),
      // `lastMovementAt` carries the movement's business date, which some
      // sources stamp at midnight — raw-milk receipts use the collection date,
      // so every batch reads 00:00. `receivedAt` orders same-day intake.
      this.batchReceivedMap(keys),
      // A batch number is opaque on its own: the raw-milk pool is a dozen
      // consignment codes, and choosing which to open for a paneer run needs
      // the centre, shift and milk type behind each one.
      new BatchOriginService(this.db, this.tenantId).resolve(keys),
    ]);

    return rows.map((r) => {
      const key = `${r.itemId}|${r.batchNo}`;
      const origin = originMap.get(key);
      return {
        ...r,
        qty: Number(r.qty),
        avgCost: Number(r.avgCost),
        value: Number(r.value),
        reorderLevel: r.reorderLevel ? Number(r.reorderLevel) : null,
        expiryDate: expiryMap.get(key) ?? null,
        receivedAt: receivedMap.get(key) ?? null,
        originKind: origin?.kind ?? null,
        originLabel: origin?.label ?? null,
        originDetail: origin?.detail ?? null,
        originDate: origin?.sourceDate ?? null,
        originShift: origin?.shift ?? null,
        originMilkType: origin?.milkType ?? null,
        originRef: origin?.sourceRef ?? null,
        receivedQty: origin?.receivedQty ?? null,
        addedQty: origin?.addedQty ?? null,
        addedAt: origin?.addedAt ?? null,
      };
    });
  }

  /** When each (item, batch) first came into stock — the earliest inbound
   *  movement's post time. Distinct from `lastMovementAt`, which tracks the
   *  latest movement against the batch and carries the business date rather
   *  than the clock time. */
  private async batchReceivedMap(
    keys: Array<{ itemId: string; batchNo: string }>,
  ): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (keys.length === 0) return out;
    const itemIds = Array.from(new Set(keys.map((k) => k.itemId)));
    const batchNos = Array.from(new Set(keys.map((k) => k.batchNo)));
    const rows = await this.db
      .select({
        itemId: stockLedger.itemId,
        batchNo: stockLedger.batchNo,
        receivedAt: sql<string>`MIN(${stockLedger.postedAt})`,
      })
      .from(stockLedger)
      .where(
        and(
          eq(stockLedger.tenantId, this.tenantId),
          inArray(stockLedger.itemId, itemIds),
          inArray(stockLedger.batchNo, batchNos),
          sql`${stockLedger.qtyIn} > 0`,
        ),
      )
      .groupBy(stockLedger.itemId, stockLedger.batchNo);
    for (const r of rows) {
      if (r.batchNo && r.receivedAt) out.set(`${r.itemId}|${r.batchNo}`, r.receivedAt);
    }
    return out;
  }

  /**
   * Earliest expiry per (item, batch) across every route a batch can enter
   * stock by. Used by on-hand to surface a shelf-life column without a second
   * round-trip per row.
   *
   * Three sources carry a date somebody entered, because a batch is not always
   * bought:
   *   inventory_grn_lines — received from a vendor
   *   wo_output           — manufactured
   *   mfg_reclaim_lines   — recovered from torn-down finished goods
   *
   * The last two matter most for shelf life: reclaimed milk has already spent
   * time in a packet, so it carries a short expiry and FEFO has to see it, or
   * it sits behind fresher stock until it spoils.
   *
   * A fourth is derived, for stock that enters by none of those routes. Raw
   * milk taken in against a procurement consignment posts straight to
   * `stock_ledger`, so nobody ever types an expiry for it and every can read
   * "no expiry" — which left FEFO with nothing to sort raw milk by, on the one
   * input in the plant that actually spoils in days. Where the item declares a
   * `shelf_life_days`, its expiry is its first inbound movement plus that many
   * days. `movedAt` is the business date, not the clock: an MP receipt stamps
   * it with the collection date, so the milk's three days run from when it was
   * collected rather than from when the plant got around to keying it in.
   *
   * Derived only as a fallback — an entered date always wins, and an item with
   * no shelf life set is left alone rather than guessed at.
   */
  private async batchExpiryMap(
    keys: Array<{ itemId: string; batchNo: string }>,
  ): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (keys.length === 0) return out;
    const itemIds = Array.from(new Set(keys.map((k) => k.itemId)));
    const batchNos = Array.from(new Set(keys.map((k) => k.batchNo)));

    // One query per source rather than a UNION: the filter needs `inArray`,
    // and drizzle expands a JS array in a raw `sql` template into a comma-list
    // of bind params — which turns `= ANY($1)` into `= ANY($1, $2)` and blows
    // up with "op ANY/ALL (array) requires array on right side".
    const [grnRows, woRows, reclaimRows] = await Promise.all([
      this.db
        .select({
          itemId: inventoryGrnLines.itemId,
          batchNo: inventoryGrnLines.batchNo,
          expiryDate: sql<string>`MIN(${inventoryGrnLines.expiryDate})::text`,
        })
        .from(inventoryGrnLines)
        .where(and(
          eq(inventoryGrnLines.tenantId, this.tenantId),
          inArray(inventoryGrnLines.itemId, itemIds),
          inArray(inventoryGrnLines.batchNo, batchNos),
          sql`${inventoryGrnLines.expiryDate} IS NOT NULL`,
        ))
        .groupBy(inventoryGrnLines.itemId, inventoryGrnLines.batchNo),
      this.db
        .select({
          itemId: woOutput.outputItemId,
          batchNo: woOutput.batchNo,
          expiryDate: sql<string>`MIN(${woOutput.expiryDate})::text`,
        })
        .from(woOutput)
        .where(and(
          eq(woOutput.tenantId, this.tenantId),
          inArray(woOutput.outputItemId, itemIds),
          inArray(woOutput.batchNo, batchNos),
          sql`${woOutput.expiryDate} IS NOT NULL`,
        ))
        .groupBy(woOutput.outputItemId, woOutput.batchNo),
      this.db
        .select({
          itemId: mfgReclaimLines.recoveredItemId,
          batchNo: mfgReclaimLines.recoveredBatchNo,
          expiryDate: sql<string>`MIN(${mfgReclaimLines.expiryDate})::text`,
        })
        .from(mfgReclaimLines)
        .where(and(
          eq(mfgReclaimLines.tenantId, this.tenantId),
          inArray(mfgReclaimLines.recoveredItemId, itemIds),
          inArray(mfgReclaimLines.recoveredBatchNo, batchNos),
          sql`${mfgReclaimLines.expiryDate} IS NOT NULL`,
        ))
        .groupBy(mfgReclaimLines.recoveredItemId, mfgReclaimLines.recoveredBatchNo),
    ]);

    // Earliest expiry wins when a batch number shows up in more than one source.
    for (const r of [...grnRows, ...woRows, ...reclaimRows]) {
      if (!r.itemId || !r.batchNo || !r.expiryDate) continue;
      const key = `${r.itemId}|${r.batchNo}`;
      const existing = out.get(key);
      if (!existing || r.expiryDate < existing) out.set(key, r.expiryDate);
    }

    const missing = keys.filter((k) => !out.has(`${k.itemId}|${k.batchNo}`));
    for (const [key, date] of await this.shelfLifeExpiryMap(missing)) out.set(key, date);
    return out;
  }

  /**
   * Expiry implied by the item's shelf life and when the batch first landed.
   *
   * Only for the keys that have no entered expiry — see `batchExpiryMap`. Both
   * halves must be present: an item with no `shelf_life_days` gets nothing, and
   * so does a batch with no inbound movement to count from.
   */
  private async shelfLifeExpiryMap(
    keys: Array<{ itemId: string; batchNo: string }>,
  ): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (keys.length === 0) return out;
    const itemIds = Array.from(new Set(keys.map((k) => k.itemId)));
    const batchNos = Array.from(new Set(keys.map((k) => k.batchNo)));

    const [shelfRows, receivedRows] = await Promise.all([
      this.db
        .select({ id: items.id, shelfLifeDays: items.shelfLifeDays })
        .from(items)
        .where(and(
          eq(items.tenantId, this.tenantId),
          inArray(items.id, itemIds),
          sql`${items.shelfLifeDays} IS NOT NULL`,
        )),
      this.db
        .select({
          itemId: stockLedger.itemId,
          batchNo: stockLedger.batchNo,
          // The business date the stock arrived on, not when it was keyed in.
          receivedOn: sql<string>`MIN(${stockLedger.movedAt})::date::text`,
        })
        .from(stockLedger)
        .where(and(
          eq(stockLedger.tenantId, this.tenantId),
          inArray(stockLedger.itemId, itemIds),
          inArray(stockLedger.batchNo, batchNos),
          sql`${stockLedger.qtyIn} > 0`,
        ))
        .groupBy(stockLedger.itemId, stockLedger.batchNo),
    ]);

    const shelfLife = new Map(shelfRows.map((r) => [r.id, Number(r.shelfLifeDays)]));
    for (const r of receivedRows) {
      if (!r.batchNo || !r.receivedOn) continue;
      const days = shelfLife.get(r.itemId);
      if (days === undefined || !Number.isFinite(days)) continue;
      out.set(`${r.itemId}|${r.batchNo}`, addDays(r.receivedOn, days));
    }
    return out;
  }

  async ledger(filter: StockLedgerFilter) {
    const conds = [eq(stockLedger.tenantId, this.tenantId)];
    if (filter.itemId) conds.push(eq(stockLedger.itemId, filter.itemId));
    if (filter.warehouseId) conds.push(eq(stockLedger.warehouseId, filter.warehouseId));
    if (filter.batchNo) conds.push(eq(stockLedger.batchNo, filter.batchNo));
    if (filter.movementType) conds.push(eq(stockLedger.movementType, filter.movementType));
    if (filter.from) conds.push(gte(stockLedger.movedAt, new Date(filter.from)));
    if (filter.to) conds.push(lte(stockLedger.movedAt, new Date(filter.to)));

    const offset = (filter.page - 1) * filter.limit;
    const rows = await this.db
      .select({
        ledger: stockLedger,
        itemName: items.name,
        itemSku: items.sku,
        warehouseName: warehouses.name,
      })
      .from(stockLedger)
      .innerJoin(items, eq(items.id, stockLedger.itemId))
      .innerJoin(warehouses, eq(warehouses.id, stockLedger.warehouseId))
      .where(and(...conds))
      .orderBy(desc(stockLedger.movedAt), desc(stockLedger.postedAt))
      .limit(filter.limit)
      .offset(offset);

    return rows.map((r) => ({
      ...r.ledger,
      qtyIn: Number(r.ledger.qtyIn),
      qtyOut: Number(r.ledger.qtyOut),
      unitCost: Number(r.ledger.unitCost),
      runningQty: Number(r.ledger.runningQty),
      runningValue: Number(r.ledger.runningValue),
      itemName: r.itemName,
      itemSku: r.itemSku,
      warehouseName: r.warehouseName,
    }));
  }

  /** Per-item stock view — used by item detail page. */
  async byItem(itemId: string) {
    const [item] = await this.db
      .select({ id: items.id, name: items.name, sku: items.sku, unit: items.unit })
      .from(items)
      .where(and(eq(items.id, itemId), eq(items.tenantId, this.tenantId)))
      .limit(1);
    if (!item) throw new NotFoundError('Item');

    const rows = await this.db
      .select({
        itemId: stockOnHand.itemId,
        warehouseId: stockOnHand.warehouseId,
        batchNo: stockOnHand.batchNo,
        qty: stockOnHand.qty,
        avgCost: stockOnHand.avgCost,
        value: stockOnHand.value,
        lastMovementAt: stockOnHand.lastMovementAt,
        warehouseName: warehouses.name,
      })
      .from(stockOnHand)
      .innerJoin(warehouses, eq(warehouses.id, stockOnHand.warehouseId))
      // Spent batches are history, not stock. Without this a milk item opens
      // as months of exhausted consignments — 81 rows reading "0 litre" —
      // with the one batch that is actually in the tank buried among them.
      // The audit trail is the place to see a batch that is finished.
      .where(and(
        eq(stockOnHand.tenantId, this.tenantId),
        eq(stockOnHand.itemId, itemId),
        sql`${stockOnHand.qty} <> 0`,
      ))
      .orderBy(asc(warehouses.name));

    // This is what an item detail screen shows when someone taps a raw
    // material, so the batches arrive labelled and in the order a run should
    // draw them: soonest to expire first, oldest intake breaking the tie.
    const onHand = await this.decorateBatches(rows);
    onHand.sort(compareByUrgency);
    return { item, onHand };
  }

  /** Barcode lookup for mobile scan. Returns the item or null. */
  async findByBarcode(code: string) {
    const [row] = await this.db
      .select()
      .from(items)
      .where(and(eq(items.tenantId, this.tenantId), eq(items.barcode, code)))
      .limit(1);
    return row ?? null;
  }
}
