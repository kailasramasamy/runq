/**
 * Wastage across a batch boundary — the case that broke in the app.
 *
 * 131.315 L on hand as two batches (121.315 + 10). A run needing 125 L drains
 * the older batch outright and takes 3.685 from the newer one, leaving 6.315
 * in the newer batch only. Writing off that 6.315 must land on the batch that
 * still holds stock, not the one FEFO just emptied.
 *
 * Usage: tsx --env-file=../../.env apps/api/scripts/smoke-mfg-wastage-split.ts
 */
import { createDb } from '@runq/db';
import { sql } from 'drizzle-orm';
import { ProductionEntryService } from '../src/modules/manufacturing/production-entry.service';

const TENANT_ID = 'a0365382-afa0-48b6-92cd-4db615a7d98b';
const USER_ID = '7257a635-aad0-4875-a288-95d38b038e63';
const WAREHOUSE_ID = '8246fed7-a1d8-448f-934c-0d4dc5e5eb96';
const OLD_BATCH = 'RM-SPLIT-OLD';
const NEW_BATCH = 'RM-SPLIT-NEW';

let pass = 0; let fail = 0;
function check(label: string, ok: boolean, detail?: string): void {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
}

async function main(): Promise<void> {
  const { db, pool } = createDb(process.env.DATABASE_URL!);
  console.log('\n=== Wastage across a batch boundary ===\n');

  const bom = (await db.execute(sql`
    SELECT b.id, l.input_item_id, l.scrap_pct::float AS scrap
    FROM boms b JOIN bom_lines l ON l.bom_id = b.id
    WHERE b.tenant_id = ${TENANT_ID} AND b.bom_code = 'BOM-A2-MILK-500ML' AND b.is_active
    LIMIT 1`) as any).rows[0];
  const itemId = bom.input_item_id as string;
  // 250 packets x 0.5 L, plus whatever scrap the BOM still carries.
  const required = Number((250 * 0.5 * (1 + bom.scrap / 100)).toFixed(3));

  for (const [batch, qty] of [[OLD_BATCH, 121.315], [NEW_BATCH, 10]] as const) {
    await db.execute(sql`DELETE FROM stock_on_hand WHERE tenant_id = ${TENANT_ID} AND item_id = ${itemId} AND batch_no = ${batch}`);
    await db.execute(sql`
      INSERT INTO stock_on_hand (tenant_id, item_id, warehouse_id, batch_no, qty, avg_cost, value, last_movement_at)
      VALUES (${TENANT_ID}, ${itemId}, ${WAREHOUSE_ID}, ${batch}, ${qty}, 50, ${qty * 50},
              ${batch === OLD_BATCH ? '2026-01-01' : '2026-06-01'}::timestamptz)`);
  }
  const leftover = Number((131.315 - required).toFixed(3));
  console.log(`  run needs ${required} L, leaves ${leftover} L in ${NEW_BATCH}\n`);

  const svc = new ProductionEntryService(db, TENANT_ID);
  const { data: wo } = await svc.record({
    bomId: bom.id,
    producedQty: 250,
    warehouseId: WAREHOUSE_ID,
    batchNo: `SPLIT-SMOKE-${Date.now()}`,
    expiryDate: '2026-12-31',
    // No batchNo on the wastage line — the server must pick what's left.
    wastage: { lines: [{ itemId, qty: leftover, notes: 'Packing residue' }] },
  } as any, USER_ID);

  const rows = (await db.execute(sql`
    SELECT batch_no, qty::float AS qty FROM stock_on_hand
    WHERE tenant_id = ${TENANT_ID} AND item_id = ${itemId}
      AND batch_no IN (${OLD_BATCH}, ${NEW_BATCH}) ORDER BY batch_no`) as any).rows;
  const onHand = Object.fromEntries(rows.map((r: any) => [r.batch_no, r.qty]));
  check('both batches fully drawn down', (onHand[OLD_BATCH] ?? 0) === 0 && (onHand[NEW_BATCH] ?? 0) === 0,
    JSON.stringify(onHand));

  const adjLines = (await db.execute(sql`
    SELECT l.batch_no, (-l.qty_delta)::float AS qty
    FROM inventory_adjustment_lines l JOIN inventory_adjustments a ON a.id = l.adjustment_id
    WHERE a.tenant_id = ${TENANT_ID} AND a.source_wo_id = ${wo.id}`) as any).rows;
  check('write-off hit the batch that still had stock',
    adjLines.length === 1 && adjLines[0].batch_no === NEW_BATCH && adjLines[0].qty === leftover,
    JSON.stringify(adjLines));

  // Asking for more than the run left must fail with a message that names it.
  let msg = '';
  try {
    await svc.record({
      bomId: bom.id, producedQty: 1, warehouseId: WAREHOUSE_ID,
      batchNo: `SPLIT-FAIL-${Date.now()}`, expiryDate: '2026-12-31',
      wastage: { lines: [{ itemId, qty: 9999 }] },
    } as any, USER_ID);
  } catch (e) { msg = (e as Error).message; }
  check('over-request explains what is left', /Cannot write off/.test(msg) && /is left after this run/.test(msg), msg);

  console.log(`\n${pass} passed, ${fail} failed\n`);
  await pool.end();
  if (fail > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
