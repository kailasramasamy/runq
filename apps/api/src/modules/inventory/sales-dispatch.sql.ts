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

/** Count of lines on the invoice that resolve to a stock-tracked item. */
export function stockableLineCount(invoiceIdExpr: SQL) {
  return sql<number>`(
    SELECT COUNT(*)::int FROM sales_invoice_items sii
    ${RESOLVED_ITEM_JOIN}
    JOIN items i ON i.id = COALESCE(sii.item_id, a.item_id)
    WHERE sii.invoice_id = ${invoiceIdExpr} AND i.track_inventory = true
  )`;
}
