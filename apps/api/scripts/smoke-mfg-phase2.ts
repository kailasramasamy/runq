/**
 * Manufacturing Phase 2 — end-to-end service-level smoke.
 *
 * Drives the real services (no HTTP), exercises the full
 * BOM → WO create → start → consume → output → close lifecycle,
 * and asserts on the resulting work_orders / stock_ledger /
 * journal_entries / journal_lines rows.
 *
 * Usage:
 *   tsx --env-file=../../.env apps/api/scripts/smoke-mfg-phase2.ts
 */

import { createDb } from '@runq/db';
import { sql } from 'drizzle-orm';
import { BomService } from '../src/modules/manufacturing/bom.service';
import { WorkOrderService } from '../src/modules/manufacturing/wo.service';
import { WoConsumptionService } from '../src/modules/manufacturing/consumption.service';
import { WoOutputService } from '../src/modules/manufacturing/output.service';
import { WoLifecycleService } from '../src/modules/manufacturing/wo-lifecycle.service';

// ── Test fixture (Vrindavan Dairy LLP — runq_dev) ──────────────────────────
const TENANT_ID = 'a0365382-afa0-48b6-92cd-4db615a7d98b';
const USER_ID = '7257a635-aad0-4875-a288-95d38b038e63';
const INPUT_ITEM_ID = '523d7453-aaed-486b-ac6f-049d05eb302b'; // Test Raw Milk (LTR, batches)
const OUTPUT_ITEM_ID = '2164a6bc-f642-4bcc-847f-368bfbe5ad8e'; // A2 Desi Cow Curd (400g, no batches)
const WAREHOUSE_ID = '69222aef-dacf-41ef-ae86-d0a234ed7ddd'; // Main Godown
const SEEDED_BATCH = 'RM-SEED-2026-A'; // 100 LTR @ ₹50/LTR pre-seeded

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail?: string): void {
  const tag = ok ? '✓' : '✗';
  console.log(`  ${tag} ${label}${detail ? ` — ${detail}` : ''}`);
  if (ok) pass++;
  else fail++;
}

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL required');
  const { db, pool } = createDb(dbUrl);

  console.log('\n=== Manufacturing Phase 2 smoke ===\n');

  // Reset input + output stock so assertions are deterministic across runs.
  // Non-batch FG items live in batch_no='' so the cleanup at end-of-run
  // can't easily target them by row; we zero them out at the top instead.
  await db.execute(sql`
    UPDATE stock_on_hand SET qty = 100, avg_cost = 50, value = 5000
    WHERE tenant_id = ${TENANT_ID}
      AND item_id = ${INPUT_ITEM_ID}
      AND batch_no = ${SEEDED_BATCH}
  `);
  await db.execute(sql`
    DELETE FROM stock_on_hand
    WHERE tenant_id = ${TENANT_ID}
      AND item_id = ${OUTPUT_ITEM_ID}
      AND warehouse_id = ${WAREHOUSE_ID}
  `);

  const bomSvc = new BomService(db, TENANT_ID);
  const woSvc = new WorkOrderService(db, TENANT_ID);
  const consSvc = new WoConsumptionService(db, TENANT_ID);
  const outSvc = new WoOutputService(db, TENANT_ID);
  const lifeSvc = new WoLifecycleService(db, TENANT_ID);

  // Unique BOM code per run so reruns don't collide on the partial unique index.
  const stamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const bomCode = `SMOKE-${stamp}`;

  // 1. Create BOM ----------------------------------------------------------
  console.log('1. Create BOM');
  const bom = await bomSvc.create(
    {
      bomCode,
      name: `Smoke ${stamp}`,
      outputItemId: OUTPUT_ITEM_ID,
      outputQty: 0.8,
      outputUom: '400g',
      lines: [
        {
          inputItemId: INPUT_ITEM_ID,
          qtyPerOutput: 1.25,
          inputUom: 'LTR',
          scrapPct: 0,
          isOptional: false,
        },
      ],
    },
    USER_ID,
  );
  check('BOM created', !!bom.id);
  check('BOM has 1 line', bom.lines.length === 1);
  check('inputItemName joined', !!bom.lines[0].inputItemName);
  check('linkedWoCount = 0', bom.linkedWoCount === 0);

  // 2. Create WO -----------------------------------------------------------
  console.log('\n2. Create WO');
  const today = new Date().toISOString().slice(0, 10);
  const wo = await woSvc.create(
    {
      bomId: bom.id,
      plannedQty: 8,
      warehouseId: WAREHOUSE_ID,
      scheduledFor: today,
      shift: 'AM',
    },
    USER_ID,
  );
  check('WO created', !!wo.id);
  check('WO numbering format', /^WO-\d{8}-\d{4}$/.test(wo.woNumber), wo.woNumber);
  check('WO snapshots bomVersion', wo.bomVersion === bom.version);
  check('WO defaults to draft', wo.status === 'draft');

  // 3. Start ----------------------------------------------------------------
  console.log('\n3. Start');
  const started = await lifeSvc.start(wo.id, USER_ID);
  check('status → in_progress', started.status === 'in_progress');
  check('startedAt set', !!started.startedAt);

  // 4. Record consumption (10 LTR from seeded batch, WAC=50) ---------------
  console.log('\n4. Record consumption');
  const consumption = await consSvc.record(
    wo.id,
    {
      bomLineId: bom.lines[0].id,
      inputItemId: INPUT_ITEM_ID,
      batchNo: SEEDED_BATCH,
      warehouseId: WAREHOUSE_ID,
      qty: 10,
      uom: 'LTR',
    },
    USER_ID,
  );
  check('Consumption row written', !!consumption.id);
  check('unitCost pulled from WAC (50)', consumption.unitCost === 50);
  check('value = qty × unitCost = 500', consumption.value === 500);
  check('stockTxnId backlinked', !!consumption.stockTxnId);

  // 5. Record output (8 kg curd) -------------------------------------------
  console.log('\n5. Record output');
  const output = await outSvc.record(
    wo.id,
    {
      outputItemId: OUTPUT_ITEM_ID,
      warehouseId: WAREHOUSE_ID,
      qty: 8,
      uom: '400g',
    },
    USER_ID,
  );
  check('Output row written', !!output.id);
  check('Auto-batch-no generated', /^SMOKE-\d{14}-\d{8}-\d{3}$/.test(output.batchNo), output.batchNo);
  check('unitCost is 0 pre-close', output.unitCost === 0);

  // 6. Complete -------------------------------------------------------------
  console.log('\n6. Complete');
  const completed = await lifeSvc.complete(wo.id, USER_ID);
  check('status → completed', completed.status === 'completed');
  check('completedAt set', !!completed.completedAt);

  // 7. Close ----------------------------------------------------------------
  console.log('\n7. Close (cost roll-up + JE + ledger backlink)');
  const closeResult = await lifeSvc.close(wo.id, { varianceAcknowledged: false }, USER_ID);
  const closed = closeResult.data;
  check('status → closed', closed.status === 'closed');
  check('closedAt set', !!closed.closedAt);
  check('je_id stored on WO', !!closed.jeId);
  check('consumed_value rolled up = 500', Number(closed.consumedValue) === 500);
  check('output_value = consumed_value (cost conservation)',
    Number(closed.outputValue) === Number(closed.consumedValue));
  // Yield variance: planned=8, actual=8 → 0
  check('yield_variance = 0 (planned == actual)', Number(closed.yieldVariance) === 0);

  // 8. JE assertions --------------------------------------------------------
  console.log('\n8. Verify journal entry');
  const je = await db.execute<{
    id: string;
    description: string;
    source_type: string;
    source_id: string;
    total_debit: string;
    total_credit: string;
  }>(sql`
    SELECT id, description, source_type, source_id, total_debit, total_credit
    FROM journal_entries WHERE id = ${closed.jeId}
  `);
  const jeRow = je.rows[0];
  check('JE row exists', !!jeRow);
  check('sourceType=work_order', jeRow?.source_type === 'work_order');
  check('sourceId = woId', jeRow?.source_id === wo.id);
  check('totalDebit = totalCredit', jeRow?.total_debit === jeRow?.total_credit);
  check('totalDebit = 500', Number(jeRow?.total_debit) === 500);

  const jeLines = await db.execute<{ account_code: string; debit: string; credit: string; description: string }>(sql`
    SELECT a.code AS account_code, jl.debit, jl.credit, jl.description
    FROM journal_lines jl JOIN accounts a ON a.id = jl.account_id
    WHERE jl.journal_entry_id = ${closed.jeId}
    ORDER BY jl.debit DESC
  `);
  check('JE has 2 lines', jeLines.rows.length === 2);
  check('Both lines on 1112',
    jeLines.rows.every((r) => r.account_code === '1112'));
  check('Dr line = 500', Number(jeLines.rows[0]?.debit) === 500);
  check('Cr line = 500', Number(jeLines.rows[1]?.credit) === 500);

  // 9. Stock ledger backlink + on-hand --------------------------------------
  console.log('\n9. Verify stock ledger');
  const ledger = await db.execute<{ movement_type: string; qty_in: string; qty_out: string; unit_cost: string; journal_entry_id: string | null }>(sql`
    SELECT movement_type, qty_in, qty_out, unit_cost, journal_entry_id
    FROM stock_ledger
    WHERE tenant_id = ${TENANT_ID} AND source_type = 'work_order' AND source_id = ${wo.id}
    ORDER BY movement_type
  `);
  check('2 ledger rows (production_in + production_out)', ledger.rows.length === 2);
  const ins = ledger.rows.find((r) => r.movement_type === 'production_in');
  const outs = ledger.rows.find((r) => r.movement_type === 'production_out');
  check('production_out qty=10', Number(outs?.qty_out) === 10);
  check('production_in qty=8', Number(ins?.qty_in) === 8);
  check('production_in unit_cost = 62.5 (500/8)', Number(ins?.unit_cost) === 62.5);
  check('both ledger rows backlinked to JE',
    ledger.rows.every((r) => r.journal_entry_id === closed.jeId));

  // Stock-on-hand checks
  const sohIn = await db.execute<{ qty: string }>(sql`
    SELECT qty FROM stock_on_hand
    WHERE tenant_id = ${TENANT_ID} AND item_id = ${INPUT_ITEM_ID} AND batch_no = ${SEEDED_BATCH}
  `);
  check('Input on-hand decremented to 90', Number(sohIn.rows[0]?.qty) === 90);

  // Output item doesn't track batches → ledger row goes into the empty
  // batch slot (`batch_no=''`). wo_output.batch_no is kept on the production
  // lot row for traceability but isn't replicated into the stock cache.
  // Sum across batch slots so the assertion works for both tracked and
  // non-tracked items.
  const sohOut = await db.execute<{ qty: string; avg_cost: string }>(sql`
    SELECT SUM(qty) AS qty, MAX(avg_cost) AS avg_cost FROM stock_on_hand
    WHERE tenant_id = ${TENANT_ID}
      AND item_id = ${OUTPUT_ITEM_ID}
      AND warehouse_id = ${WAREHOUSE_ID}
      AND last_movement_at >= NOW() - INTERVAL '5 minutes'
  `);
  check('Output on-hand qty=8', Number(sohOut.rows[0]?.qty) === 8);
  check('Output WAC = 62.5', Number(sohOut.rows[0]?.avg_cost) === 62.5);

  // 10. linkedWoCount reflects new WO ---------------------------------------
  console.log('\n10. linkedWoCount enrichment');
  const refreshedBom = await bomSvc.getById(bom.id);
  check('linkedWoCount = 1 after WO create', refreshedBom.linkedWoCount === 1);

  // 11. Idempotency (Phase 2.5) ---------------------------------------------
  // Drive a second WO so we can record a consumption with a known key and
  // replay the same call — the second send must NOT create a duplicate row.
  console.log('\n11. Idempotency dedupe (Phase 2.5)');
  const bom2 = await bomSvc.create(
    {
      bomCode: `SMOKE-IDEM-${stamp}`,
      name: `Smoke idem ${stamp}`,
      outputItemId: OUTPUT_ITEM_ID,
      outputQty: 1,
      outputUom: '400g',
      lines: [{ inputItemId: INPUT_ITEM_ID, qtyPerOutput: 1, inputUom: 'LTR', scrapPct: 0, isOptional: false }],
    },
    USER_ID,
  );
  const wo2 = await woSvc.create(
    { bomId: bom2.id, plannedQty: 1, warehouseId: WAREHOUSE_ID, scheduledFor: today },
    USER_ID,
  );
  await lifeSvc.start(wo2.id, USER_ID);
  const idemKey = `smoke-${Date.now()}`;
  const first = await consSvc.record(
    wo2.id,
    {
      bomLineId: bom2.lines[0].id,
      inputItemId: INPUT_ITEM_ID,
      batchNo: SEEDED_BATCH,
      warehouseId: WAREHOUSE_ID,
      qty: 1,
      uom: 'LTR',
      idempotencyKey: idemKey,
    },
    USER_ID,
  );
  const replayed = await consSvc.record(
    wo2.id,
    {
      bomLineId: bom2.lines[0].id,
      inputItemId: INPUT_ITEM_ID,
      batchNo: SEEDED_BATCH,
      warehouseId: WAREHOUSE_ID,
      qty: 1,
      uom: 'LTR',
      idempotencyKey: idemKey,
    },
    USER_ID,
  );
  check('Replay returns same row id', first.id === replayed.id);
  const idemCount = await db.execute<{ count: string }>(sql`
    SELECT COUNT(*)::text AS count FROM wo_consumption
    WHERE wo_id = ${wo2.id} AND idempotency_key = ${idemKey}
  `);
  check('Only 1 row written despite 2 calls', Number(idemCount.rows[0]?.count) === 1);

  // Output idempotency
  const outIdemKey = `smoke-out-${Date.now()}`;
  const o1 = await outSvc.record(
    wo2.id,
    { outputItemId: OUTPUT_ITEM_ID, warehouseId: WAREHOUSE_ID, qty: 1, uom: '400g', idempotencyKey: outIdemKey },
    USER_ID,
  );
  const o2 = await outSvc.record(
    wo2.id,
    { outputItemId: OUTPUT_ITEM_ID, warehouseId: WAREHOUSE_ID, qty: 1, uom: '400g', idempotencyKey: outIdemKey },
    USER_ID,
  );
  check('Output replay returns same row id', o1.id === o2.id);

  // 12. Phase 3 reports + dashboard ----------------------------------------
  // Hand-calc validation: the first WO produced 8 kg curd from 10 LTR milk
  // (consumed ₹500, output ₹500, planned 8 == actual 8 → variance 0).
  console.log('\n12. Phase 3 reports + dashboard');
  const {
    ManufacturingReportsService,
  } = await import('../src/modules/manufacturing/reports.service');
  const reportsSvc = new ManufacturingReportsService(db, TENANT_ID);

  const dashboard = await reportsSvc.getDashboard();
  check('dashboard returns object', !!dashboard);
  check('dashboard exposes activeBomCount', typeof dashboard.activeBomCount === 'number');
  check('dashboard exposes weekVariancePct field', 'weekVariancePct' in dashboard);
  check('dashboard topBomsThisWeek is array', Array.isArray(dashboard.topBomsThisWeek));
  check(
    'dashboard includes the smoke BOM in topBoms (≥1 run this week)',
    dashboard.topBomsThisWeek.some((b) => b.bomId === bom.id || b.bomId === bom2.id),
  );

  const woSummary = await reportsSvc.woSummary({ bomId: bom.id });
  const summaryRow = woSummary.find((r) => r.woId === wo.id);
  check('wo-summary returns the closed WO', !!summaryRow);
  check('wo-summary plannedQty = 8', summaryRow?.plannedQty === 8);
  check('wo-summary actualOutputQty = 8', summaryRow?.actualOutputQty === 8);
  check('wo-summary consumedValue = 500', Number(summaryRow?.consumedValue) === 500);
  check('wo-summary outputValue = 500', Number(summaryRow?.outputValue) === 500);
  check('wo-summary yieldVariance = 0', Number(summaryRow?.yieldVariance) === 0);
  check('wo-summary status = closed', summaryRow?.status === 'closed');

  const yieldTrend = await reportsSvc.yieldTrend({ bomId: bom.id });
  check('yield-trend returns at least 1 point', yieldTrend.length >= 1);
  const todayPoint = yieldTrend.find((p) => p.bucketDate === today);
  check('yield-trend has bucket for today', !!todayPoint);
  check('yield-trend today yieldPct = 100', todayPoint?.yieldPct === 100);

  const bomUsage = await reportsSvc.bomUsage({});
  const usageRow = bomUsage.find((u) => u.bomId === bom.id);
  check('bom-usage includes smoke BOM', !!usageRow);
  check('bom-usage smoke BOM runs = 1', usageRow?.runs === 1);
  check('bom-usage smoke BOM closedRuns = 1', usageRow?.closedRuns === 1);

  // wo2 is `in_progress` after start; it's never `completed`. Confirm
  // pending-close filter excludes it.
  const pendingClose = await reportsSvc.woPendingClose({});
  check('wo-pending-close does not include in_progress WOs',
    !pendingClose.some((r) => r.woId === wo2.id));
  check('wo-pending-close does not include closed WOs',
    !pendingClose.some((r) => r.woId === wo.id));

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log(`\n=== Result: ${pass} passed, ${fail} failed ===\n`);

  // Cleanup — leave the data in place for ad-hoc inspection if there were
  // failures; otherwise tidy up so reruns are idempotent.
  if (fail === 0) {
    console.log('Cleaning up smoke data…');
    await db.execute(sql`
      UPDATE stock_on_hand SET qty = 100, avg_cost = 50, value = 5000
      WHERE tenant_id = ${TENANT_ID}
        AND item_id = ${INPUT_ITEM_ID}
        AND batch_no = ${SEEDED_BATCH}
    `);
    await db.execute(sql`
      DELETE FROM stock_on_hand
      WHERE tenant_id = ${TENANT_ID} AND item_id = ${OUTPUT_ITEM_ID} AND warehouse_id = ${WAREHOUSE_ID}
    `);
    await db.execute(sql`DELETE FROM stock_ledger WHERE source_type = 'work_order' AND source_id = ${wo.id}`);
    await db.execute(sql`DELETE FROM journal_lines WHERE journal_entry_id = ${closed.jeId}`);
    await db.execute(sql`DELETE FROM journal_entries WHERE id = ${closed.jeId}`);
    await db.execute(sql`DELETE FROM wo_consumption WHERE wo_id = ${wo.id}`);
    await db.execute(sql`DELETE FROM wo_output WHERE wo_id = ${wo.id}`);
    await db.execute(sql`DELETE FROM work_orders WHERE id = ${wo.id}`);
    await db.execute(sql`DELETE FROM bom_lines WHERE bom_id = ${bom.id}`);
    await db.execute(sql`DELETE FROM boms WHERE id = ${bom.id}`);
    // Phase 2.5 idempotency-test residue
    await db.execute(sql`DELETE FROM stock_ledger WHERE source_type IN ('work_order','work_order_reversal') AND source_id = ${wo2.id}`);
    await db.execute(sql`DELETE FROM wo_consumption WHERE wo_id = ${wo2.id}`);
    await db.execute(sql`DELETE FROM wo_output WHERE wo_id = ${wo2.id}`);
    await db.execute(sql`DELETE FROM work_orders WHERE id = ${wo2.id}`);
    await db.execute(sql`DELETE FROM bom_lines WHERE bom_id = ${bom2.id}`);
    await db.execute(sql`DELETE FROM boms WHERE id = ${bom2.id}`);
    console.log('Done.\n');
  } else {
    console.log(`Leaving WO ${wo.id} + BOM ${bom.id} in place for inspection.\n`);
  }

  await pool.end();
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Smoke crashed:', err);
  process.exit(1);
});
