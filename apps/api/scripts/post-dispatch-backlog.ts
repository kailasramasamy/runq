/**
 * One-off: post the invoices left stranded in the Awaiting-dispatch queue.
 *
 * Between 12 and 23 Aug 2026 auto-dispatch raised a delivery note per invoice
 * and every one of them failed to post — a DN posts whole or not at all, and
 * one out-of-stock milk line took the whole note down with it, including the
 * lines that did have stock. Commit 4034133b fixed that by shipping what is
 * covered and parking the rest, but the notes already sitting in draft were
 * assembled under the old rule and still hold uncoverable lines.
 *
 * So this cancels those stale drafts and re-runs each invoice through the
 * fixed path. Dated to the invoice, not today: the goods left on the day they
 * were billed, and backdating keeps the COGS entry in the same period as the
 * revenue it belongs to.
 *
 * Dry by default. Pass --commit to write.
 */

import { createDb } from '@runq/db';
import { sql } from 'drizzle-orm';
import { AutoDispatchService } from '../src/modules/inventory/auto-dispatch.service';
import { DeliveryNoteService } from '../src/modules/inventory/delivery.service';

const TENANT = 'a0365382-afa0-48b6-92cd-4db615a7d98b';
const USER = '0e92182d-0ec2-464e-997d-c34d3f45e3a1'; // Kailas Ramasamy (owner)
const COMMIT = process.argv.includes('--commit');

interface QueuedRow { id: string; invoice_number: string; invoice_date: string }
interface DraftRow { id: string; dn_no: string }

async function main() {
  const { db, pool } = createDb(process.env.DATABASE_URL!);
  const ctx = { db, tenantId: TENANT, userId: USER };

  // The same queue the Awaiting-dispatch screen shows: issued, not waived,
  // and still owing goods on at least one stock-tracked line.
  const queued = (await db.execute(sql`
    SELECT si.id, si.invoice_number, si.invoice_date::text AS invoice_date
    FROM sales_invoices si
    WHERE si.tenant_id = ${TENANT}
      AND si.status NOT IN ('draft', 'cancelled')
      AND si.dispatch_waived_at IS NULL
      AND EXISTS (
        SELECT 1 FROM sales_invoice_items sii
        JOIN items i ON i.id = sii.item_id
        WHERE sii.invoice_id = si.id AND i.track_inventory
          AND sii.quantity > COALESCE((
            SELECT SUM(CASE WHEN d.direction = 'in' THEN -l.qty ELSE l.qty END)
            FROM delivery_note_lines l JOIN delivery_notes d ON d.id = l.dn_id
            WHERE l.invoice_line_id = sii.id AND d.status = 'dispatched'
          ), 0))
    ORDER BY si.invoice_date, si.invoice_number
  `) as unknown as { rows: QueuedRow[] }).rows;

  console.log(`${queued.length} invoices queued${COMMIT ? '' : '  (dry run — pass --commit to write)'}\n`);

  const dispatch = new AutoDispatchService(ctx);
  const notes = new DeliveryNoteService(ctx);

  for (const inv of queued) {
    // Any live DN makes dispatchOne skip the invoice, so the stale draft has
    // to go first. It is a draft: cancelling it moves no stock.
    const drafts = (await db.execute(sql`
      SELECT id, dn_no FROM delivery_notes
      WHERE tenant_id = ${TENANT} AND invoice_id = ${inv.id} AND status = 'draft'
    `) as unknown as { rows: DraftRow[] }).rows;

    if (!COMMIT) {
      console.log(`${inv.invoice_number} (${inv.invoice_date})  would cancel ${drafts.map((d) => d.dn_no).join(', ') || '—'} and re-dispatch`);
      continue;
    }

    for (const d of drafts) {
      await notes.cancel(d.id, { reason: 'Superseded — re-dispatched after the whole-DN failure fix' });
    }

    const outcome = await dispatch.dispatchOne(inv.id, { dateMode: 'invoice' });
    const detail = outcome.status === 'dispatched'
      ? `${outcome.dnNo} · ${outcome.lineCount} lines${outcome.shortfall ? ` · short: ${outcome.shortfall.reason}` : ''}`
      : 'reason' in outcome ? outcome.reason : '';
    console.log(`${inv.invoice_number} (${inv.invoice_date})  ${outcome.status.toUpperCase()}  ${detail}`);
  }

  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
