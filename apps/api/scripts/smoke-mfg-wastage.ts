/**
 * Manufacturing — wastage write-off at Record Production.
 *
 * Replays the real scenario: 578 L raw milk on hand, a run packs 1120 x 500ml
 * packets, and 10 L must be left on hand for the next paneer run.
 *
 * BOM-A2-MILK-500ML carries scrap_pct = 1%, so the backflush already draws
 * 565.6 L (560 L into packets + 5.6 L of allowed process loss absorbed into
 * the packets' cost). Only the 2.4 L beyond that allowance is abnormal, and
 * that is what gets written off here. Zero the BOM's scrap_pct if you would
 * rather the full 8 L show up in the wastage register.
 *
 * Asserts the write-off lands as a posted production_loss adjustment linked to
 * the run, that stock nets to 10 L, that the loss hits 5104, and that the
 * daily write-off register prices it.
 *
 * Usage: tsx --env-file=../../.env apps/api/scripts/smoke-mfg-wastage.ts
 */
import { createDb } from '@runq/db';
import { sql } from 'drizzle-orm';
import { ProductionEntryService } from '../src/modules/manufacturing/production-entry.service';
import { ReportsService } from '../src/modules/inventory/reports.service';

const TENANT_ID = 'a0365382-afa0-48b6-92cd-4db615a7d98b';
const USER_ID = '7257a635-aad0-4875-a288-95d38b038e63';
const WAREHOUSE_ID = '8246fed7-a1d8-448f-934c-0d4dc5e5eb96'; // Vrindavan Main Plant
const BATCH = 'RM-WASTAGE-SMOKE';
const RATE = 50;

let pass = 0; let fail = 0;
function check(label: string, ok: boolean, detail?: string): void {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
}

async function main(): Promise<void> {
  const { db, pool } = createDb(process.env.DATABASE_URL!);
  console.log('\n=== Wastage write-off smoke ===\n');

  const bom = (await db.execute(sql`
    SELECT b.id, b.output_item_id, l.input_item_id
    FROM boms b JOIN bom_lines l ON l.bom_id = b.id
    WHERE b.tenant_id = ${TENANT_ID} AND b.bom_code = 'BOM-A2-MILK-500ML' AND b.is_active
    LIMIT 1`) as any).rows[0];
  const inputItemId = bom.input_item_id as string;

  // 578 L on hand at ₹50 — a purchased (capitalised) batch, so the write-off
  // has value to post. MP-procured milk would price at 0 and skip the JE.
  await db.execute(sql`DELETE FROM stock_on_hand WHERE tenant_id = ${TENANT_ID} AND item_id = ${inputItemId} AND batch_no = ${BATCH}`);
  await db.execute(sql`
    INSERT INTO stock_on_hand (tenant_id, item_id, warehouse_id, batch_no, qty, avg_cost, value)
    VALUES (${TENANT_ID}, ${inputItemId}, ${WAREHOUSE_ID}, ${BATCH}, 578, ${RATE}, ${578 * RATE})`);

  const svc = new ProductionEntryService(db, TENANT_ID);
  const { data: wo } = await svc.record({
    bomId: bom.id,
    producedQty: 1120,              // 1120 x 500ml = 560 L
    warehouseId: WAREHOUSE_ID,
    batchNo: `WASTE-SMOKE-${Date.now()}`,
    expiryDate: '2026-12-31',
    lines: [{ inputItemId, batchNo: BATCH, qty: 565.6 }],
    wastage: { lines: [{ itemId: inputItemId, batchNo: BATCH, qty: 2.4, notes: 'Fill variation + line residue' }] },
  } as any, USER_ID);

  const onHand = (await db.execute(sql`
    SELECT qty::float AS qty FROM stock_on_hand
    WHERE tenant_id = ${TENANT_ID} AND item_id = ${inputItemId} AND batch_no = ${BATCH}`) as any).rows[0];
  check('10 L left on hand for the paneer run', onHand.qty === 10, `${onHand.qty} L`);

  const adj = (await db.execute(sql`
    SELECT a.adj_no, a.reason, a.status, a.source_wo_id, a.total_value_delta::float AS delta,
           a.journal_entry_id, l.qty_delta::float AS qty
    FROM inventory_adjustments a JOIN inventory_adjustment_lines l ON l.adjustment_id = a.id
    WHERE a.tenant_id = ${TENANT_ID} AND a.source_wo_id = ${wo.id}`) as any).rows[0];
  check('wastage posted as production_loss', adj?.reason === 'production_loss' && adj?.status === 'posted');
  check('linked back to the run', adj?.source_wo_id === wo.id, wo.woNumber);
  check('2.4 L written off', adj?.qty === -2.4, `${adj?.qty} L`);
  check('valued at WAC', adj?.delta === -2.4 * RATE, `₹${adj?.delta}`);

  const je = (await db.execute(sql`
    SELECT ac.code, jl.debit::float AS debit, jl.credit::float AS credit
    FROM journal_lines jl JOIN accounts ac ON ac.id = jl.account_id
    WHERE jl.journal_entry_id = ${adj.journal_entry_id} ORDER BY ac.code`) as any).rows;
  const writeOff = je.find((r: any) => r.code === '5104');
  check('Dr 5104 Inventory Write-off', writeOff?.debit === 2.4 * RATE, JSON.stringify(je));

  const today = new Date().toISOString().slice(0, 10);
  const report = await new ReportsService(db, TENANT_ID).writeOffs({ from: today, to: today } as any);
  const day = report.days.find((d: any) => d.date === today);
  check('shows in the daily write-off register', (day?.value ?? 0) >= 2.4 * RATE, `₹${day?.value} across ${day?.lines.length} line(s)`);
  const line = day?.lines.find((l: any) => l.woNumber === wo.woNumber) as any;
  check('register names the run', !!line, line ? `${line.itemName} ${line.qty}${line.uom} ₹${line.value} (${line.reason})` : 'not found');

  console.log(`\n${pass} passed, ${fail} failed\n`);
  await pool.end();
  if (fail > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
