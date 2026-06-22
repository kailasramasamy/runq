/**
 * Dhenu PP raw-milk → stock_ledger bridge (P1.2) — end-to-end against runq_dev.
 *
 * Proves the traceability link: when a tanker is received at a processing plant,
 * a raw-milk batch is posted into the inventory stock_ledger, keyed to the
 * milk-type item map, valued at zero (GL/valuation deferred to P1.1).
 *   • PP receipt of a single-type (cow_a1) consignment → one stock_ledger row
 *     (item = cow_a1 item, qty = receipt, value 0, batch = consignment no) +
 *     stockLedgerId linked + stock_on_hand updated.
 *   • reverse() backs the batch out (on-hand returns to 0).
 *   • mixed/unmapped source → posting skipped (best-effort), stockLedgerId null.
 *
 * All fixtures are synthetic (E2E-RM-*) and torn down in `finally`.
 *
 * Usage: pnpm --filter @runq/api exec tsx --env-file=../../.env apps/api/scripts/e2e-mp-raw-milk.ts
 */

import {
  createDb, mpNodes, mpConsignments, mpGlSettings, mpRawMilkItems,
  items, warehouses, stockLedger, stockOnHand,
} from '@runq/db';
import { and, eq, inArray } from 'drizzle-orm';
import { ConsignmentService } from '../src/modules/milk-procurement/consignment.service';
import { ConfigService } from '../src/modules/milk-procurement/config.service';

const TENANT_ID = '4ae78c54-aef4-46cb-9283-3db65edd076b'; // runq Demo Co
const DATE = '2020-02-05'; // synthetic period
const WH_CODE = 'E2E-RM-WH';
const ITEM_SKU = 'E2E-RM-COW-A1';
const NODE_VMCC = 'E2E-RM-VMCC';
const NODE_CC = 'E2E-RM-CC';
const NODE_CC2 = 'E2E-RM-CC2';
const NODE_PP = 'E2E-RM-PP';
const ALL = { kind: 'all' as const };

let pass = 0, fail = 0;
function check(label: string, ok: boolean, detail?: string): void {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
}

async function cleanup(db: any): Promise<void> {
  const nodes = await db.select({ id: mpNodes.id }).from(mpNodes)
    .where(and(eq(mpNodes.tenantId, TENANT_ID),
      inArray(mpNodes.code, [NODE_VMCC, NODE_CC, NODE_CC2, NODE_PP])));
  const nodeIds = nodes.map((n: any) => n.id);
  if (nodeIds.length) {
    await db.delete(mpConsignments).where(inArray(mpConsignments.fromNodeId, nodeIds));
    await db.delete(mpConsignments).where(inArray(mpConsignments.toNodeId, nodeIds));
  }
  const wh = await db.select({ id: warehouses.id }).from(warehouses)
    .where(and(eq(warehouses.tenantId, TENANT_ID), eq(warehouses.code, WH_CODE)));
  for (const w of wh) {
    await db.delete(stockLedger).where(eq(stockLedger.warehouseId, w.id));
    await db.delete(stockOnHand).where(eq(stockOnHand.warehouseId, w.id));
  }
  await db.delete(mpRawMilkItems).where(eq(mpRawMilkItems.tenantId, TENANT_ID));
  await db.update(mpGlSettings).set({ rawMilkWarehouseId: null }).where(eq(mpGlSettings.tenantId, TENANT_ID));
  await db.delete(items).where(and(eq(items.tenantId, TENANT_ID), eq(items.sku, ITEM_SKU)));
  for (const w of wh) await db.delete(warehouses).where(eq(warehouses.id, w.id));
  if (nodeIds.length) await db.delete(mpNodes).where(inArray(mpNodes.id, nodeIds));
}

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL required');
  const { db, pool } = createDb(dbUrl);

  console.log('\n=== Dhenu PP raw-milk → stock_ledger e2e ===\n');
  await cleanup(db);

  try {
    // ── Fixtures ──────────────────────────────────────────────────────────────
    const [wh] = await db.insert(warehouses).values({
      tenantId: TENANT_ID, code: WH_CODE, name: 'E2E Raw-milk WH', type: 'godown',
    }).returning();
    const [item] = await db.insert(items).values({
      tenantId: TENANT_ID, name: 'E2E Raw Milk Cow A1', sku: ITEM_SKU, type: 'product',
      itemClass: 'raw_material', unit: 'L', packSizeUqc: 'LTR',
      trackInventory: true, trackBatches: true,
    }).returning();

    await new ConfigService(db, TENANT_ID).upsertSettings({ rawMilkWarehouseId: wh.id });
    await db.insert(mpRawMilkItems).values({ tenantId: TENANT_ID, milkType: 'cow_a1', itemId: item.id });

    const mkNode = async (code: string, nodeType: string) => {
      const [n] = await db.insert(mpNodes).values({
        tenantId: TENANT_ID, code, name: code, nodeType, hasBmc: false,
      }).returning();
      return n;
    };
    const vmcc = await mkNode(NODE_VMCC, 'vmcc');
    const cc = await mkNode(NODE_CC, 'cc');
    const cc2 = await mkNode(NODE_CC2, 'cc');
    const pp = await mkNode(NODE_PP, 'pp');

    // Upstream received milk at CC (cow_a1 only) gives the CC its composition.
    await db.insert(mpConsignments).values({
      tenantId: TENANT_ID, consignmentNo: 'E2E-RM-UP-1', kind: 'vmcc_to_cc',
      fromNodeId: vmcc.id, toNodeId: cc.id, collectionDate: DATE, milkType: 'cow_a1',
      dispatchQty: '100', receiptQty: '100', status: 'received',
    });
    // CC2 received a mix (cow_a1 + buffalo) → derives null → 'mixed' (unmapped).
    await db.insert(mpConsignments).values([
      { tenantId: TENANT_ID, consignmentNo: 'E2E-RM-UP-2', kind: 'vmcc_to_cc',
        fromNodeId: vmcc.id, toNodeId: cc2.id, collectionDate: DATE, milkType: 'cow_a1',
        dispatchQty: '50', receiptQty: '50', status: 'received' },
      { tenantId: TENANT_ID, consignmentNo: 'E2E-RM-UP-3', kind: 'vmcc_to_cc',
        fromNodeId: vmcc.id, toNodeId: cc2.id, collectionDate: DATE, milkType: 'buffalo',
        dispatchQty: '40', receiptQty: '40', status: 'received' },
    ]);

    const svc = new ConsignmentService(db, TENANT_ID);

    // ── Happy path: PP receives cow_a1 from CC → stock posted ──────────────────
    const recv = await svc.directReceive(
      { fromNodeId: cc.id, toNodeId: pp.id, collectionDate: DATE, qty: 80, fat: 4, snf: 8.5 } as any,
      undefined, ALL,
    );
    check('consignment milk type derived = cow_a1', recv.milkType === 'cow_a1', `got ${recv.milkType}`);
    check('stockLedgerId linked on receipt', !!recv.stockLedgerId);

    const [led] = await db.select().from(stockLedger)
      .where(and(eq(stockLedger.tenantId, TENANT_ID), eq(stockLedger.id, recv.stockLedgerId!)));
    check('ledger row item = cow_a1 item', led?.itemId === item.id);
    check('ledger row warehouse = raw-milk WH', led?.warehouseId === wh.id);
    check('ledger qtyIn = 80', Number(led?.qtyIn) === 80, `got ${led?.qtyIn}`);
    check('ledger valued at zero', Number(led?.unitCost) === 0 && Number(led?.runningValue) === 0);
    check('ledger batch = consignment no', led?.batchNo === recv.consignmentNo);
    check('ledger sourceType = mp_receipt', led?.sourceType === 'mp_receipt');

    const onHand = async () => {
      const [r] = await db.select().from(stockOnHand).where(and(
        eq(stockOnHand.tenantId, TENANT_ID), eq(stockOnHand.itemId, item.id),
        eq(stockOnHand.warehouseId, wh.id), eq(stockOnHand.batchNo, recv.consignmentNo!)));
      return r ? Number(r.qty) : 0;
    };
    check('stock_on_hand qty = 80 after receipt', (await onHand()) === 80);

    // ── Reversal backs the batch out ───────────────────────────────────────────
    await svc.reverse(recv.id, ALL);
    check('stock_on_hand qty = 0 after reverse', (await onHand()) === 0);
    const revRows = await db.select().from(stockLedger).where(and(
      eq(stockLedger.tenantId, TENANT_ID), eq(stockLedger.sourceType, 'mp_receipt_adjustment'),
      eq(stockLedger.sourceId, recv.id)));
    check('reversal posted an adjustment_out row', revRows.length === 1 && Number(revRows[0].qtyOut) === 80);

    // ── Best-effort skip: mixed/unmapped source → no stock ─────────────────────
    const mixed = await svc.directReceive(
      { fromNodeId: cc2.id, toNodeId: pp.id, collectionDate: DATE, qty: 30, fat: 4, snf: 8.5 } as any,
      undefined, ALL,
    );
    check('mixed source derives null milk type', mixed.milkType === null, `got ${mixed.milkType}`);
    check('unmapped type → no stock posted (best-effort)', mixed.stockLedgerId === null);

    console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed\n`);
  } finally {
    await cleanup(db);
    await pool.end();
  }
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
