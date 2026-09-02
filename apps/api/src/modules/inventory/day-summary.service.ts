import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Db } from '@runq/db';
import { ITEM_CLASS_GROUP_MEMBERS, type DaySummaryQuery } from '@runq/validators';
import { IST } from '../manufacturing/mfg-day.js';

/**
 * One IST calendar day of plant activity — what came in, what was made, what
 * went out — read entirely off the stock ledger.
 *
 * Off the ledger, not off GRN / DN / WO documents: stock also arrives from
 * milk receipts and leaves through farmer sales, and a plant that never
 * raises a GRN would otherwise read a permanent zero. Every bucket below is
 * keyed on `movement_type`, which every writer sets, and labelled by
 * `source_type`, which says which document did it.
 *
 * The day is always an explicit IST date (see mfg-day.ts): a bare
 * CURRENT_DATE is Asia/Kolkata locally but UTC on Railway, where a 4am
 * dispatch files under yesterday.
 */
type DispatchLine = {
  itemName: string;
  unit: string | null;
  batchNo: string | null;
  qty: number;
  value: number;
};

type ProductionInput = {
  itemName: string;
  unit: string | null;
  batchNo: string | null;
  /** IST date the batch first entered stock, as YYYY-MM-DD. */
  receivedOn: string | null;
  qty: number;
  value: number;
};

/**
 * One output row can come from several work orders (three unplanned runs of
 * the same SKU in a day), and each may draw the same input. Merge on
 * item + batch so the panel reads as one bill of materials, not a log.
 */
function mergeInputs(list: ProductionInput[]): ProductionInput[] {
  const by = new Map<string, ProductionInput>();
  for (const r of list) {
    const key = `${r.itemName}|${r.batchNo ?? ''}`;
    const hit = by.get(key);
    if (hit) {
      hit.qty += r.qty;
      hit.value += r.value;
    } else {
      by.set(key, { ...r });
    }
  }
  return [...by.values()].sort((a, b) => b.value - a.value);
}

export class DaySummaryService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  /** Today's IST calendar date as YYYY-MM-DD — the plant's "today". */
  static istToday(): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: IST }).format(new Date());
  }

  async summary(q: DaySummaryQuery) {
    const date = q.date ?? DaySummaryService.istToday();
    const wh = q.warehouseId;
    const [totals, materials, produced, dispatched, other] = await Promise.all([
      this.totals(date, wh),
      this.materials(date, wh),
      this.produced(date, wh),
      this.dispatched(date, wh),
      this.otherMovements(date, wh),
    ]);
    return {
      date,
      isToday: date === DaySummaryService.istToday(),
      warehouseId: wh ?? null,
      totals,
      materials,
      produced,
      dispatched,
      other,
    };
  }

  /** Ledger rows belonging to one IST day, optionally one warehouse. */
  private dayWhere(date: string, warehouseId?: string): SQL {
    return sql`sl.tenant_id = ${this.tenantId}
      AND (sl.moved_at AT TIME ZONE ${IST})::date = ${date}::date
      ${warehouseId ? sql`AND sl.warehouse_id = ${warehouseId}` : sql``}`;
  }

  /**
   * The three headline numbers, plus what the day cost in consumption and
   * losses. Counts are distinct source documents, so a 20-line GRN is one
   * receipt — the same way the Home KPIs count.
   */
  private async totals(date: string, warehouseId?: string) {
    const docs = (f: SQL) =>
      sql`COUNT(DISTINCT (sl.source_type, sl.source_id)) FILTER (WHERE ${f})::int`;
    const inVal = (f: SQL) =>
      sql`COALESCE(SUM(sl.qty_in * sl.unit_cost) FILTER (WHERE ${f}), 0)::text`;
    const outVal = (f: SQL) =>
      sql`COALESCE(SUM(sl.qty_out * sl.unit_cost) FILTER (WHERE ${f}), 0)::text`;
    const received = sql`sl.movement_type IN ('grn', 'transfer_in')`;
    const madeIn = sql`sl.movement_type = 'production_in'`;
    const consumed = sql`sl.movement_type = 'production_out'`;
    const sent = sql`sl.movement_type = 'delivery'`;
    const result = await this.db.execute(sql`
      SELECT
        ${inVal(received)} AS received_value, ${docs(received)} AS received_docs,
        ${inVal(madeIn)} AS produced_value, ${docs(madeIn)} AS produced_docs,
        ${outVal(consumed)} AS consumed_value,
        ${outVal(sent)} AS dispatched_value, ${docs(sent)} AS dispatched_docs,
        ${inVal(sql`sl.movement_type = 'sales_return_in'`)} AS returned_value,
        ${docs(sql`sl.movement_type NOT IN
          ('grn', 'transfer_in', 'production_in', 'production_out', 'delivery')`)}
          AS other_docs
      FROM stock_ledger sl
      WHERE ${this.dayWhere(date, warehouseId)}
    `);
    const r = (result as unknown as { rows: Array<Record<string, string | number>> }).rows[0]!;
    return {
      receivedValue: Number(r.received_value),
      receivedDocs: Number(r.received_docs),
      producedValue: Number(r.produced_value),
      producedDocs: Number(r.produced_docs),
      consumedValue: Number(r.consumed_value),
      dispatchedValue: Number(r.dispatched_value),
      dispatchedDocs: Number(r.dispatched_docs),
      returnedValue: Number(r.returned_value),
      otherDocs: Number(r.other_docs),
    };
  }

  /**
   * Every input item's day in four numbers: opening → received → consumed →
   * closing, with `otherNet` carrying transfers / adjustments so the row adds
   * up on screen. A plant owner checks that arithmetic, so it has to close.
   *
   * Closing is derived backwards from live on-hand rather than replayed
   * forwards from the ledger's running_qty: on-hand is the authority, and
   * subtracting everything that moved after the chosen day gives the exact
   * balance at its end for any past date.
   *
   * Items with no movement that day are still listed when they hold stock —
   * "old stock" is half the question this screen answers.
   */
  private async materials(date: string, warehouseId?: string) {
    const classes = sql.join(
      ITEM_CLASS_GROUP_MEMBERS.bom_inputs.map((c) => sql`${c}`),
      sql`, `,
    );
    const whFilter = warehouseId ? sql`AND sl.warehouse_id = ${warehouseId}` : sql``;
    const result = await this.db.execute(sql`
      WITH day_mov AS (
        SELECT sl.item_id,
          SUM(sl.qty_in - sl.qty_out) AS net,
          COALESCE(SUM(sl.qty_in) FILTER (
            WHERE sl.movement_type IN ('grn', 'transfer_in')), 0) AS received,
          COALESCE(SUM(sl.qty_in * sl.unit_cost) FILTER (
            WHERE sl.movement_type IN ('grn', 'transfer_in')), 0) AS received_value,
          COALESCE(SUM(sl.qty_out) FILTER (
            WHERE sl.movement_type = 'production_out'), 0) AS consumed,
          COALESCE(SUM(sl.qty_out * sl.unit_cost) FILTER (
            WHERE sl.movement_type = 'production_out'), 0) AS consumed_value
        FROM stock_ledger sl
        WHERE ${this.dayWhere(date, warehouseId)}
        GROUP BY sl.item_id
      ),
      after_mov AS (
        SELECT sl.item_id, SUM(sl.qty_in - sl.qty_out) AS net
        FROM stock_ledger sl
        WHERE sl.tenant_id = ${this.tenantId}
          AND (sl.moved_at AT TIME ZONE ${IST})::date > ${date}::date
          ${whFilter}
        GROUP BY sl.item_id
      ),
      on_hand AS (
        SELECT soh.item_id, SUM(soh.qty) AS qty
        FROM stock_on_hand soh
        WHERE soh.tenant_id = ${this.tenantId}
          ${warehouseId ? sql`AND soh.warehouse_id = ${warehouseId}` : sql``}
        GROUP BY soh.item_id
      ),
      item_day AS (
        SELECT i.id, i.name, i.sku, i.unit, i.item_class::text AS item_class,
          COALESCE(dm.received, 0) AS received,
          COALESCE(dm.received_value, 0) AS received_value,
          COALESCE(dm.consumed, 0) AS consumed,
          COALESCE(dm.consumed_value, 0) AS consumed_value,
          COALESCE(dm.net, 0) AS day_net,
          COALESCE(oh.qty, 0) - COALESCE(am.net, 0) AS closing,
          dm.item_id IS NOT NULL AS moved
        FROM items i
        LEFT JOIN day_mov dm ON dm.item_id = i.id
        LEFT JOIN after_mov am ON am.item_id = i.id
        LEFT JOIN on_hand oh ON oh.item_id = i.id
        WHERE i.tenant_id = ${this.tenantId}
          AND i.item_class IN (${classes})
      )
      SELECT id, name, sku, unit, item_class, moved,
        received::text, received_value::text, consumed::text, consumed_value::text,
        closing::text, (closing - day_net)::text AS opening,
        (day_net - received + consumed)::text AS other_net
      FROM item_day
      WHERE moved OR closing > 0
      ORDER BY moved DESC, received_value DESC, closing DESC
      LIMIT 300
    `);
    return (result as unknown as { rows: Array<Record<string, string | boolean | null>> })
      .rows.map((r) => ({
        itemId: r.id as string,
        itemName: r.name as string,
        sku: r.sku as string | null,
        unit: r.unit as string | null,
        itemClass: r.item_class as string,
        moved: r.moved === true,
        opening: Number(r.opening),
        received: Number(r.received),
        receivedValue: Number(r.received_value),
        consumed: Number(r.consumed),
        consumedValue: Number(r.consumed_value),
        otherNet: Number(r.other_net),
        closing: Number(r.closing),
      }));
  }

  /**
   * Finished goods made that day, one row per item + batch — the batch is
   * what a plant worker points at on the floor, and what the FEFO picker
   * will draw from tomorrow.
   */
  private async produced(date: string, warehouseId?: string) {
    const result = await this.db.execute(sql`
      SELECT sl.item_id, i.name, i.sku, i.unit, sl.batch_no,
        SUM(sl.qty_in)::text AS qty,
        SUM(sl.qty_in * sl.unit_cost)::text AS value,
        MAX(wo.wo_number) AS wo_number,
        MAX(wo.entry_mode::text) AS entry_mode,
        MAX(w.name) AS warehouse_name,
        ARRAY_AGG(DISTINCT sl.source_id) FILTER (
          WHERE sl.source_type = 'work_order') AS wo_ids
      FROM stock_ledger sl
      INNER JOIN items i ON i.id = sl.item_id
      INNER JOIN warehouses w ON w.id = sl.warehouse_id
      LEFT JOIN work_orders wo
        ON wo.id = sl.source_id AND sl.source_type = 'work_order'
      WHERE ${this.dayWhere(date, warehouseId)}
        AND sl.movement_type = 'production_in'
      GROUP BY sl.item_id, i.name, i.sku, i.unit, sl.batch_no
      ORDER BY SUM(sl.qty_in * sl.unit_cost) DESC
      LIMIT 200
    `);
    const rows = (result as unknown as {
      rows: Array<Record<string, string | string[] | null>>;
    }).rows;
    const inputs = await this.productionInputs(
      [...new Set(rows.flatMap((r) => (r.wo_ids as string[] | null) ?? []))],
    );
    return rows.map((r) => ({
      itemId: r.item_id as string,
      itemName: r.name as string,
      sku: r.sku as string | null,
      unit: r.unit as string | null,
      batchNo: r.batch_no as string | null,
      qty: Number(r.qty),
      value: Number(r.value),
      woNumber: r.wo_number as string | null,
      entryMode: r.entry_mode as string | null,
      warehouseName: r.warehouse_name as string | null,
      inputs: mergeInputs(
        ((r.wo_ids as string[] | null) ?? []).flatMap((id) => inputs.get(id) ?? []),
      ),
    }));
  }

  /**
   * What each work order consumed, so a finished batch can name the material
   * it was made from — which raw-milk batch went into today's paneer is the
   * first thing anyone asks when a customer complains.
   *
   * Read off the ledger's `production_out` rows rather than `wo_consumption`:
   * the ledger is what actually moved, and it carries the batch.
   */
  private async productionInputs(woIds: string[]) {
    const byWo = new Map<string, ProductionInput[]>();
    if (woIds.length === 0) return byWo;
    const result = await this.db.execute(sql`
      WITH consumed AS (
        SELECT sl.source_id AS wo_id, sl.item_id, i.name, i.unit, sl.batch_no,
          SUM(sl.qty_out) AS qty,
          SUM(sl.qty_out * sl.unit_cost) AS value
        FROM stock_ledger sl
        INNER JOIN items i ON i.id = sl.item_id
        WHERE sl.tenant_id = ${this.tenantId}
          AND sl.movement_type = 'production_out'
          AND sl.source_type = 'work_order'
          AND sl.source_id IN (${sql.join(woIds.map((id) => sql`${id}`), sql`, `)})
        GROUP BY sl.source_id, sl.item_id, i.name, i.unit, sl.batch_no
      )
      SELECT c.wo_id, c.name, c.unit, c.batch_no,
        c.qty::text AS qty, c.value::text AS value,
        (r.received_at AT TIME ZONE ${IST})::date::text AS received_on
      FROM consumed c
      -- When the batch first entered the plant. A consignment code means
      -- nothing to the eye; the date it landed is how the floor tells one
      -- tanker from the next.
      LEFT JOIN LATERAL (
        SELECT MIN(l.moved_at) AS received_at
        FROM stock_ledger l
        WHERE l.tenant_id = ${this.tenantId}
          AND l.item_id = c.item_id
          AND COALESCE(l.batch_no, '') = COALESCE(c.batch_no, '')
          AND l.qty_in > 0
      ) r ON TRUE
      ORDER BY c.value DESC
    `);
    for (const r of (result as unknown as {
      rows: Array<Record<string, string | null>>;
    }).rows) {
      const list = byWo.get(r.wo_id!) ?? [];
      list.push({
        itemName: r.name!,
        unit: r.unit,
        batchNo: r.batch_no,
        receivedOn: r.received_on,
        qty: Number(r.qty),
        value: Number(r.value),
      });
      byWo.set(r.wo_id!, list);
    }
    return byWo;
  }

  /**
   * What left the gate, one row per outward document. Delivery notes carry a
   * customer; farmer sales and any other `delivery` writer do not, so the
   * join is outer and the caller labels the row from `sourceType`.
   */
  private async dispatched(date: string, warehouseId?: string) {
    const result = await this.db.execute(sql`
      SELECT sl.source_type, sl.source_id, dn.dn_no, c.name AS customer_name,
        COUNT(DISTINCT sl.item_id)::int AS item_count,
        SUM(sl.qty_out)::text AS qty,
        SUM(sl.qty_out * sl.unit_cost)::text AS value
      FROM stock_ledger sl
      LEFT JOIN delivery_notes dn
        ON dn.id = sl.source_id AND sl.source_type = 'delivery_note'
      LEFT JOIN customers c ON c.id = dn.customer_id
      WHERE ${this.dayWhere(date, warehouseId)}
        AND sl.movement_type = 'delivery'
      GROUP BY sl.source_type, sl.source_id, dn.dn_no, c.name
      ORDER BY SUM(sl.qty_out * sl.unit_cost) DESC
      LIMIT 200
    `);
    const rows = (result as unknown as {
      rows: Array<Record<string, string | number | null>>;
    }).rows;
    const lines = await this.dispatchLines(date, warehouseId);
    return rows.map((r) => ({
      sourceType: r.source_type as string,
      sourceId: r.source_id as string,
      docNo: r.dn_no as string | null,
      customerName: r.customer_name as string | null,
      itemCount: Number(r.item_count),
      qty: Number(r.qty),
      value: Number(r.value),
      items: lines.get(r.source_id as string) ?? [],
    }));
  }

  /**
   * What was actually on each outward document, item by item. One query for
   * the whole day rather than one per dispatch: a busy afternoon is 40 notes,
   * and the panel behind each chevron has to already be there when it opens.
   */
  private async dispatchLines(date: string, warehouseId?: string) {
    const result = await this.db.execute(sql`
      SELECT sl.source_id, i.name, i.unit, sl.batch_no,
        SUM(sl.qty_out)::text AS qty,
        SUM(sl.qty_out * sl.unit_cost)::text AS value
      FROM stock_ledger sl
      INNER JOIN items i ON i.id = sl.item_id
      WHERE ${this.dayWhere(date, warehouseId)}
        AND sl.movement_type = 'delivery'
      GROUP BY sl.source_id, i.name, i.unit, sl.batch_no
      ORDER BY SUM(sl.qty_out * sl.unit_cost) DESC
    `);
    const byDoc = new Map<string, DispatchLine[]>();
    for (const r of (result as unknown as {
      rows: Array<Record<string, string | null>>;
    }).rows) {
      const list = byDoc.get(r.source_id!) ?? [];
      list.push({
        itemName: r.name!,
        unit: r.unit,
        batchNo: r.batch_no,
        qty: Number(r.qty),
        value: Number(r.value),
      });
      byDoc.set(r.source_id!, list);
    }
    return byDoc;
  }

  /**
   * Everything the three headline buckets don't cover — transfers out,
   * adjustments, stock takes, reclaims, returns, reversals — collapsed to one
   * row per movement type. It exists so the day reconciles: stock that moved
   * without being received, made or dispatched is still visible.
   */
  private async otherMovements(date: string, warehouseId?: string) {
    const result = await this.db.execute(sql`
      SELECT sl.movement_type::text AS movement_type,
        COUNT(DISTINCT (sl.source_type, sl.source_id))::int AS docs,
        COALESCE(SUM(sl.qty_in * sl.unit_cost), 0)::text AS in_value,
        COALESCE(SUM(sl.qty_out * sl.unit_cost), 0)::text AS out_value
      FROM stock_ledger sl
      WHERE ${this.dayWhere(date, warehouseId)}
        AND sl.movement_type NOT IN
          ('grn', 'transfer_in', 'production_in', 'production_out', 'delivery')
      GROUP BY sl.movement_type
      ORDER BY COALESCE(SUM(sl.qty_in * sl.unit_cost), 0)
             + COALESCE(SUM(sl.qty_out * sl.unit_cost), 0) DESC
    `);
    return (result as unknown as { rows: Array<Record<string, string | number>> })
      .rows.map((r) => ({
        movementType: r.movement_type as string,
        docs: Number(r.docs),
        inValue: Number(r.in_value),
        outValue: Number(r.out_value),
      }));
  }
}
