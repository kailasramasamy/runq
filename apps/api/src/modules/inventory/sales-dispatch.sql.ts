/**
 * Shared SQL fragments for the invoice → dispatch lane.
 *
 * Every one of these hangs off the same idea: an invoice line owes goods when
 * it resolves to a stock-tracked item and its dispatched qty is short of the
 * invoiced qty. Keeping the fragments in one place stops the queue filter,
 * the preview and the AR status strip from drifting apart and disagreeing
 * about what "dispatched" means.
 */

import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

/**
 * Resolves an invoice line to a master item: the direct link first, then a
 * remembered description alias. Expects `sii` in scope.
 */
export const RESOLVED_ITEM_JOIN = sql`
  LEFT JOIN invoice_import_item_aliases a
    ON a.tenant_id = sii.tenant_id
   AND lower(a.source_name) = lower(sii.description)
`;

/**
 * Qty already gone out for an invoice line. Counts dispatched DNs only —
 * drafts haven't moved stock. Nets off returns so a returned line becomes
 * dispatchable again rather than being stuck at "fully sent".
 */
export function dispatchedQtyFor(lineIdExpr: SQL | string) {
  return sql`COALESCE((
    SELECT SUM(CASE WHEN d.direction = 'in' THEN -l.qty ELSE l.qty END)
    FROM delivery_note_lines l
    JOIN delivery_notes d ON d.id = l.dn_id
    WHERE l.invoice_line_id = ${lineIdExpr} AND d.status = 'dispatched'
  ), 0)`;
}

/**
 * Same as above but also counts open drafts. Used only by the over-dispatch
 * guard: two drafts for the same line would each look valid alone.
 */
export function committedQtyFor(lineIdExpr: SQL | string) {
  return sql`COALESCE((
    SELECT SUM(CASE WHEN d.direction = 'in' THEN -l.qty ELSE l.qty END)
    FROM delivery_note_lines l
    JOIN delivery_notes d ON d.id = l.dn_id
    WHERE l.invoice_line_id = ${lineIdExpr}
      AND d.status IN ('draft', 'dispatched')
  ), 0)`;
}

/** True when the invoice still owes goods on at least one line. */
export function hasUndispatchedLines(invoiceIdExpr: SQL) {
  return sql`EXISTS (
    SELECT 1 FROM sales_invoice_items sii
    ${RESOLVED_ITEM_JOIN}
    JOIN items i ON i.id = COALESCE(sii.item_id, a.item_id)
    WHERE sii.invoice_id = ${invoiceIdExpr}
      AND i.track_inventory = true
      AND sii.quantity > ${dispatchedQtyFor(sql`sii.id`)}
  )`;
}

/**
 * How many branded packs the pool behind a made-on-demand SKU could still
 * produce, and which input runs out first.
 *
 * Without this the preview shows a flat 0 on hand for a SKU that is in fact
 * fully coverable, and the operator reads it as an out-of-stock. Reporting the
 * *limiting* input rather than assuming the bulk one is the constraint means a
 * label shortage says "labels", which is the thing that actually needs fixing.
 * A line's substitutes count toward its stock, since the line will accept them.
 *
 * Expects `i` (the resolved item) and `sii` in scope. Yields no row when the
 * SKU has no active auto-repack BOM, so the join stays a cheap no-op for the
 * ordinary case.
 */
export function repackCapacityJoin(warehouseIdExpr: SQL | string) {
  return sql`
    LEFT JOIN LATERAL (
      SELECT cap.pool_item_name, cap.capacity_qty
      FROM boms b
      JOIN LATERAL (
        SELECT
          src.name AS pool_item_name,
          (COALESCE((
            -- The line's own item plus anything it accepts instead: a line
            -- that takes any raw milk is limited by the tank, not by one type.
            SELECT SUM(soh2.qty) FROM stock_on_hand soh2
            WHERE soh2.tenant_id = b.tenant_id
              AND soh2.warehouse_id = ${warehouseIdExpr}
              AND (
                soh2.item_id = bl.input_item_id
                OR soh2.item_id IN (
                  SELECT bls.item_id FROM bom_line_substitutes bls
                  WHERE bls.bom_line_id = bl.id
                )
              )
          ), 0) / NULLIF(bl.qty_per_output * (1 + bl.scrap_pct / 100), 0))
            * b.output_qty AS capacity_qty
        FROM bom_lines bl
        JOIN items src ON src.id = bl.input_item_id
        WHERE bl.bom_id = b.id AND bl.is_optional = false
        ORDER BY capacity_qty ASC
        LIMIT 1
      ) cap ON true
      WHERE b.tenant_id = sii.tenant_id
        AND b.output_item_id = i.id
        AND b.is_active = true
        AND b.allow_auto_repack = true
      LIMIT 1
    ) rp ON true
  `;
}

/** Count of lines on the invoice that resolve to a stock-tracked item. */
export function stockableLineCount(invoiceIdExpr: SQL) {
  return sql<number>`(
    SELECT COUNT(*)::int FROM sales_invoice_items sii
    ${RESOLVED_ITEM_JOIN}
    JOIN items i ON i.id = COALESCE(sii.item_id, a.item_id)
    WHERE sii.invoice_id = ${invoiceIdExpr} AND i.track_inventory = true
  )`;
}
