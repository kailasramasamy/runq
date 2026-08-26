/**
 * Second pass: top up invoices that already shipped once.
 *
 * `AutoDispatchService` refuses an invoice that has any live delivery note,
 * which is the right guard against double-shipping but also means a partially
 * shipped invoice can never auto-top-up. The 25 Aug invoices each posted a DN
 * for what was on hand that day and parked the rest; stock has since landed
 * for some of those parked lines.
 *
 * So this walks the same preview the Awaiting-dispatch screen shows, ships
 * whatever the warehouse can now cover, and leaves the rest alone. The
 * over-dispatch guard inside createFromInvoice is what keeps this honest —
 * it counts what already went out, so a line cannot ship twice.
 *
 * Dry by default. Pass --commit to write.
 */

import { createDb } from '@runq/db';
import { sql } from 'drizzle-orm';
import { SalesDispatchService } from '../src/modules/inventory/sales-dispatch.service';
import { DeliveryNoteService } from '../src/modules/inventory/delivery.service';
import { splitByAvailability } from '../src/modules/inventory/auto-dispatch.logic';

const TENANT = 'a0365382-afa0-48b6-92cd-4db615a7d98b';
const USER = '0e92182d-0ec2-464e-997d-c34d3f45e3a1';
const WAREHOUSE = '8246fed7-a1d8-448f-934c-0d4dc5e5eb96';
const COMMIT = process.argv.includes('--commit');

interface QueuedRow { id: string; invoice_number: string; invoice_date: string }

async function main() {
  const { db, pool } = createDb(process.env.DATABASE_URL!);
  const ctx = { db, tenantId: TENANT, userId: USER };

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

  const dispatch = new SalesDispatchService(ctx);
  const notes = new DeliveryNoteService(ctx);

  for (const inv of queued) {
    const { lines } = await dispatch.previewInvoice(inv.id, WAREHOUSE);
    const shippable = lines.filter(
      (l) => (l.resolution === 'item' || l.resolution === 'alias') && l.remainingQty > 0 && l.itemId,
    );
    const { ready } = splitByAvailability(shippable);
    if (ready.length === 0) {
      console.log(`${inv.invoice_number}  nothing coverable`);
      continue;
    }

    const covered = ready.map(({ line, qty }) => `${line.itemName} x${qty}`).join(', ');
    if (!COMMIT) {
      console.log(`${inv.invoice_number} (${inv.invoice_date})  would ship ${covered}`);
      continue;
    }

    const dn = await dispatch.createFromInvoice(inv.id, {
      warehouseId: WAREHOUSE,
      dispatchDate: inv.invoice_date,
      vehicleNo: null,
      lrNo: null,
      notes: 'Top-up dispatch - stock landed after the original shipment',
      lines: ready.map(({ line, qty }) => ({
        itemId: line.itemId!,
        invoiceLineId: line.invoiceLineId,
        qty,
        batchNo: qty === line.remainingQty ? line.suggestedBatchNo ?? null : null,
        uom: line.uom ?? null,
      })),
    });
    await notes.dispatch(dn.id);
    console.log(`${inv.invoice_number} (${inv.invoice_date})  ${dn.dnNo}  ${covered}`);
  }

  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
