/**
 * Stock alerts — the low-stock and out-of-stock lists.
 *
 * Supersedes ReorderService.alerts(), which could only see items with a
 * reorder level configured. An item with no reorder level that hits zero
 * is still a stockout, and is surfaced here.
 *
 * Every list is computed live off `stock_on_hand`; nothing is read from
 * `inventory_stock_alert_state` (that table only drives notifications).
 */

import { sql } from 'drizzle-orm';
import type { Db } from '@runq/db';
import type { StockAlertFilter } from '@runq/validators';
import { alertBaseCte, type AlertStatus } from './stock-alert.sql';

export interface StockAlertRow {
  itemId: string;
  warehouseId: string;
  itemName: string;
  itemSku: string | null;
  itemUnit: string | null;
  warehouseName: string;
  status: Exclude<AlertStatus, 'ok'>;
  /** Within `low`: at or below half the reorder level reads as critical. */
  urgency: 'out' | 'critical' | 'warning';
  onHand: number;
  reorderLevel: number | null;
  reorderQty: number | null;
  leadTimeDays: number | null;
  shortBy: number;
  supplierName: string | null;
  daysSinceLastMovement: number | null;
}

export interface StockAlertCounts {
  out: number;
  low: number;
  total: number;
}

interface RawRow {
  item_id: string; warehouse_id: string; item_name: string;
  item_sku: string | null; item_unit: string | null; warehouse_name: string;
  status: 'low' | 'out'; on_hand: string;
  reorder_level: string | null; reorder_qty: string | null;
  lead_time_days: number | null; supplier_name: string | null;
  days_since_movement: number | null;
}

export class StockAlertService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  /** Alert rows, worst first. Filters narrow by status, warehouse and text. */
  async list(filter: StockAlertFilter = {}): Promise<StockAlertRow[]> {
    const statusCond = filter.status && filter.status !== 'all'
      ? sql`AND b.status = ${filter.status}`
      : sql`AND b.status <> 'ok'`;
    const warehouseCond = filter.warehouseId
      ? sql`AND b.warehouse_id = ${filter.warehouseId}`
      : sql``;
    const searchCond = filter.search
      ? sql`AND (b.item_name ILIKE ${`%${filter.search}%`} OR b.item_sku ILIKE ${`%${filter.search}%`})`
      : sql``;

    const result = await this.db.execute(sql`
      WITH ${alertBaseCte(this.tenantId)},
      ${lastSupplierCte(this.tenantId)},
      last_move AS (
        SELECT item_id, warehouse_id, MAX(moved_at) AS moved_at
        FROM stock_ledger
        WHERE tenant_id = ${this.tenantId}
        GROUP BY item_id, warehouse_id
      )
      SELECT
        b.item_id, b.warehouse_id, b.item_name, b.item_sku, b.item_unit,
        b.warehouse_name, b.status,
        b.on_hand::text AS on_hand,
        b.reorder_level::text AS reorder_level,
        b.reorder_qty::text AS reorder_qty,
        b.lead_time_days,
        ls.supplier_name,
        (CURRENT_DATE - lm.moved_at::date) AS days_since_movement
      FROM alert_base b
      LEFT JOIN last_supplier ls
        ON ls.item_id = b.item_id AND ls.warehouse_id = b.warehouse_id
      LEFT JOIN last_move lm
        ON lm.item_id = b.item_id AND lm.warehouse_id = b.warehouse_id
      WHERE TRUE ${statusCond} ${warehouseCond} ${searchCond}
      ORDER BY
        CASE b.status WHEN 'out' THEN 0 ELSE 1 END,
        CASE WHEN b.reorder_level > 0 THEN b.on_hand / b.reorder_level ELSE 0 END ASC,
        b.item_name ASC
    `);

    return ((result as unknown as { rows: RawRow[] }).rows).map(toRow);
  }

  /** Headline counts for the hero tiles and the Alerts tab badge. */
  async counts(warehouseId?: string): Promise<StockAlertCounts> {
    const warehouseCond = warehouseId ? sql`AND b.warehouse_id = ${warehouseId}` : sql``;
    const result = await this.db.execute(sql`
      WITH ${alertBaseCte(this.tenantId)}
      SELECT
        COUNT(*) FILTER (WHERE b.status = 'out')::int AS out_count,
        COUNT(*) FILTER (WHERE b.status = 'low')::int AS low_count
      FROM alert_base b
      WHERE b.status <> 'ok' ${warehouseCond}
    `);
    const row = (result as unknown as {
      rows: Array<{ out_count: number; low_count: number }>;
    }).rows[0];
    const out = row?.out_count ?? 0;
    const low = row?.low_count ?? 0;
    return { out, low, total: out + low };
  }
}

/**
 * Preferred supplier per (item, warehouse): the vendor on the most recent
 * posted GRN that brought this item into this warehouse.
 */
function lastSupplierCte(tenantId: string) {
  return sql`
    last_supplier AS (
      SELECT DISTINCT ON (gl.item_id, g.warehouse_id)
        gl.item_id, g.warehouse_id, v.name AS supplier_name
      FROM inventory_grn_lines gl
      INNER JOIN inventory_grns g ON g.id = gl.grn_id
      LEFT JOIN vendors v ON v.id = g.vendor_id
      WHERE gl.tenant_id = ${tenantId} AND g.status = 'posted'
      ORDER BY gl.item_id, g.warehouse_id, g.received_date DESC, g.created_at DESC
    )
  `;
}

function toRow(r: RawRow): StockAlertRow {
  const onHand = Number(r.on_hand);
  const reorderLevel = r.reorder_level === null ? null : Number(r.reorder_level);
  return {
    itemId: r.item_id,
    warehouseId: r.warehouse_id,
    itemName: r.item_name,
    itemSku: r.item_sku,
    itemUnit: r.item_unit,
    warehouseName: r.warehouse_name,
    status: r.status,
    urgency: urgencyFor(r.status, onHand, reorderLevel),
    onHand,
    reorderLevel,
    reorderQty: r.reorder_qty === null ? null : Number(r.reorder_qty),
    leadTimeDays: r.lead_time_days,
    shortBy: reorderLevel === null ? 0 : Math.max(0, reorderLevel - onHand),
    supplierName: r.supplier_name,
    daysSinceLastMovement: r.days_since_movement,
  };
}

function urgencyFor(
  status: 'low' | 'out',
  onHand: number,
  reorderLevel: number | null,
): StockAlertRow['urgency'] {
  if (status === 'out') return 'out';
  if (reorderLevel === null || reorderLevel <= 0) return 'warning';
  return onHand / reorderLevel <= 0.5 ? 'critical' : 'warning';
}
