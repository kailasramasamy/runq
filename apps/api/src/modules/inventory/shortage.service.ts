/**
 * The goods that were billed and never went out.
 *
 * Auto-dispatch has always split a short line — what the warehouse could cover
 * posts, the rest is parked on a draft DN. The parking worked; the finding did
 * not. The shortfall announced itself once, in a toast on the invoice screen,
 * to whoever happened to be issuing at the time, and after that it existed
 * only as a draft indistinguishable from any other.
 *
 * This is the list nobody had: what is short, for whom, since when, and — the
 * column that makes it actionable — whether stock has since arrived, so the
 * morning's first job is posting the drafts that can now go.
 */

import { sql } from 'drizzle-orm';
import type { Db } from '@runq/db';
import type { ShortageFilter } from '@runq/validators';

interface Ctx { db: Db; tenantId: string; userId?: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

export interface ShortageLine {
  dnId: string;
  dnNo: string;
  dispatchDate: string;
  ageDays: number;
  invoiceId: string | null;
  invoiceNumber: string | null;
  customerId: string | null;
  customerName: string | null;
  warehouseId: string;
  warehouseName: string;
  itemId: string;
  itemName: string;
  itemSku: string | null;
  uom: string | null;
  shortQty: number;
  /** On hand now — the shortfall was measured when the van left, not today. */
  availableQty: number;
  /** True once stock caught up: this draft can simply be posted. */
  coverable: boolean;
  /** Declared stand-ins with stock, so the row can offer a way out. */
  substituteCount: number;
}

export class ShortageService {
  constructor(private readonly ctx: Ctx) {}

  async list(filter: ShortageFilter) {
    const rows = await this.rows(filter);
    const total = rows.length ? Number(rows[0]!.total_count) : 0;
    return {
      data: rows.map(toShortageLine),
      page: filter.page,
      limit: filter.limit,
      total,
      totalPages: Math.ceil(total / filter.limit),
    };
  }

  /**
   * A count cheap enough to sit on the delivery page's tab label and in the
   * inventory dashboard, without dragging the rows along with it.
   */
  async openCount(): Promise<number> {
    const result = await this.ctx.db.execute(sql`
      SELECT COUNT(*)::int AS n
      FROM delivery_note_lines l
      JOIN delivery_notes d ON d.id = l.dn_id
      WHERE d.tenant_id = ${this.ctx.tenantId}
        AND d.is_shortfall = true AND d.status = 'draft'
    `);
    return Number((result as unknown as { rows: Row[] }).rows[0]?.n ?? 0);
  }

  private async rows(filter: ShortageFilter): Promise<Row[]> {
    const result = await this.ctx.db.execute(sql`
      WITH shortage AS (
        SELECT
          d.id AS dn_id, d.dn_no, d.dispatch_date, d.invoice_id,
          d.customer_id, d.warehouse_id,
          l.item_id, l.qty AS short_qty, l.uom
        FROM delivery_note_lines l
        JOIN delivery_notes d ON d.id = l.dn_id
        WHERE d.tenant_id = ${this.ctx.tenantId}
          AND d.is_shortfall = true
          AND d.status = 'draft'
          ${filter.warehouseId ? sql`AND d.warehouse_id = ${filter.warehouseId}` : sql``}
          ${filter.customerId ? sql`AND d.customer_id = ${filter.customerId}` : sql``}
      ), scored AS (
        SELECT
          s.*,
          i.name AS item_name, i.sku AS item_sku,
          w.name AS warehouse_name,
          c.name AS customer_name,
          inv.invoice_number,
          (CURRENT_DATE - s.dispatch_date)::int AS age_days,
          COALESCE((
            SELECT SUM(soh.qty) FROM stock_on_hand soh
            WHERE soh.tenant_id = ${this.ctx.tenantId}
              AND soh.item_id = s.item_id
              AND soh.warehouse_id = s.warehouse_id
          ), 0) AS available_qty,
          COALESCE((
            SELECT COUNT(*) FROM item_substitutes sub
            JOIN items si ON si.id = sub.substitute_item_id AND si.is_active = true
            WHERE sub.tenant_id = ${this.ctx.tenantId}
              AND sub.item_id = s.item_id
              AND COALESCE((
                SELECT SUM(soh2.qty) FROM stock_on_hand soh2
                WHERE soh2.tenant_id = ${this.ctx.tenantId}
                  AND soh2.item_id = sub.substitute_item_id
                  AND soh2.warehouse_id = s.warehouse_id
              ), 0) > 0
          ), 0)::int AS substitute_count
        FROM shortage s
        JOIN items i ON i.id = s.item_id
        JOIN warehouses w ON w.id = s.warehouse_id
        LEFT JOIN customers c ON c.id = s.customer_id
        LEFT JOIN sales_invoices inv ON inv.id = s.invoice_id
      )
      SELECT *, COUNT(*) OVER ()::int AS total_count
      FROM scored
      ${filter.coverableOnly ? sql`WHERE available_qty >= short_qty` : sql``}
      -- Oldest first: a shortfall that has been open a week is a customer
      -- still waiting, whatever landed on the shelf this morning.
      ORDER BY dispatch_date ASC, dn_no ASC
      LIMIT ${filter.limit} OFFSET ${(filter.page - 1) * filter.limit}
    `);
    return (result as unknown as { rows: Row[] }).rows;
  }
}

function toShortageLine(r: Row): ShortageLine {
  const shortQty = Number(r.short_qty);
  const availableQty = Number(r.available_qty ?? 0);
  return {
    dnId: r.dn_id,
    dnNo: r.dn_no,
    dispatchDate: r.dispatch_date,
    ageDays: Number(r.age_days ?? 0),
    invoiceId: r.invoice_id ?? null,
    invoiceNumber: r.invoice_number ?? null,
    customerId: r.customer_id ?? null,
    customerName: r.customer_name ?? null,
    warehouseId: r.warehouse_id,
    warehouseName: r.warehouse_name,
    itemId: r.item_id,
    itemName: r.item_name,
    itemSku: r.item_sku ?? null,
    uom: r.uom ?? null,
    shortQty,
    availableQty,
    coverable: availableQty >= shortQty,
    substituteCount: Number(r.substitute_count ?? 0),
  };
}
