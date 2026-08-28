/**
 * Farmer sales → stock_ledger — end-to-end against runq_dev.
 *
 * A sale to a farmer used to book money only. That was right for bulk milk the
 * centre itself collected (the sale shrinks the dispatch, so the plant receipt
 * is already net of it) and wrong for everything else — most visibly a type the
 * centre never pours, which comes off plant stock with nothing to book it out.
 *
 *   • milk the node collected      → NO stock movement (dispatch nets it)
 *   • milk the node never collected → the whole qty leaves plant stock
 *   • a partial cover              → only the shortfall leaves
 *   • delete / reverse / edit      → the draw is put back, then retaken
 *   • more than the plant holds    → refused, nothing written
 *   • a product                    → stock out + COGS Dr 5100 / Cr 1112
 *
 * All fixtures are synthetic (E2E-FSS-*) and torn down in `finally`.
 *
 * Usage: pnpm --filter @runq/api exec tsx --env-file=../../.env apps/api/scripts/e2e-mp-farmer-sale-stock.ts
 */

import {
  createDb, mpNodes, mpFarmers, mpFarmerMemberships, mpFarmerSales, mpFarmerLedger,
  mpPours, mpGlSettings, mpRawMilkItems, items, warehouses, stockLedger, stockOnHand,
  vendors, journalEntries, journalLines, accounts, stockAlertState,
} from '@runq/db';
import { and, eq, inArray } from 'drizzle-orm';
import { FarmerSaleService } from '../src/modules/milk-procurement/farmer-sale.service';
import { ConfigService } from '../src/modules/milk-procurement/config.service';
import { StockLedgerService } from '../src/modules/inventory/stock-ledger.service';

const TENANT_ID = '4ae78c54-aef4-46cb-9283-3db65edd076b'; // runq Demo Co
const DATE = '2020-03-05'; // synthetic period
const WH_CODE = 'E2E-FSS-WH';
const MILK_SKU = 'E2E-FSS-A2';
const PROD_SKU = 'E2E-FSS-GHEE';
const NODE_VMCC = 'E2E-FSS-VMCC';
const FARMER_CODE = 'E2E-FSS-F1';
const ALL = { kind: 'all' as const };

let pass = 0, fail = 0;
function check(label: string, ok: boolean, detail?: string): void {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any;

async function cleanup(db: AnyDb): Promise<void> {
  const nodes = await db.select({ id: mpNodes.id }).from(mpNodes)
    .where(and(eq(mpNodes.tenantId, TENANT_ID), eq(mpNodes.code, NODE_VMCC)));
  const nodeIds = nodes.map((n: { id: string }) => n.id);
  const farmers = await db.select({ id: mpFarmers.id }).from(mpFarmers)
    .where(and(eq(mpFarmers.tenantId, TENANT_ID), eq(mpFarmers.code, FARMER_CODE)));
  const farmerIds = farmers.map((f: { id: string }) => f.id);

  if (farmerIds.length) {
    const sales = await db.select({ id: mpFarmerSales.id }).from(mpFarmerSales)
      .where(inArray(mpFarmerSales.farmerId, farmerIds));
    // Sales first: they carry an FK to the journal entry being removed.
    await db.delete(mpFarmerSales).where(inArray(mpFarmerSales.farmerId, farmerIds));
    for (const s of sales) {
      for (const t of ['mp_farmer_sale_cogs', 'mp_farmer_sale_cogs_reversal',
        'mp_farmer_sale', 'mp_farmer_sale_reversal', 'mp_farmer_sale_adjust']) {
        const jes = await db.select({ id: journalEntries.id }).from(journalEntries)
          .where(and(eq(journalEntries.sourceType, t), eq(journalEntries.sourceId, s.id)));
        for (const je of jes) {
          await db.delete(journalLines).where(eq(journalLines.journalEntryId, je.id));
          await db.delete(journalEntries).where(eq(journalEntries.id, je.id));
        }
      }
    }
    await db.delete(mpFarmerLedger).where(inArray(mpFarmerLedger.farmerId, farmerIds));
    await db.delete(mpPours).where(inArray(mpPours.farmerId, farmerIds));
    await db.delete(mpFarmerMemberships).where(inArray(mpFarmerMemberships.farmerId, farmerIds));
    await db.delete(mpFarmers).where(inArray(mpFarmers.id, farmerIds));
  }
  const wh = await db.select({ id: warehouses.id }).from(warehouses)
    .where(and(eq(warehouses.tenantId, TENANT_ID), eq(warehouses.code, WH_CODE)));
  for (const w of wh) {
    await db.delete(stockLedger).where(eq(stockLedger.warehouseId, w.id));
    await db.delete(stockOnHand).where(eq(stockOnHand.warehouseId, w.id));
    await db.delete(stockAlertState).where(eq(stockAlertState.warehouseId, w.id));
  }
  await db.delete(mpRawMilkItems).where(eq(mpRawMilkItems.tenantId, TENANT_ID));
  await db.update(mpGlSettings).set({ rawMilkWarehouseId: null })
    .where(eq(mpGlSettings.tenantId, TENANT_ID));
  await db.delete(items).where(and(eq(items.tenantId, TENANT_ID),
    inArray(items.sku, [MILK_SKU, PROD_SKU])));
  for (const w of wh) {
    await db.update(warehouses).set({ isDefault: false }).where(eq(warehouses.id, w.id));
    await db.delete(warehouses).where(eq(warehouses.id, w.id));
  }
  if (nodeIds.length) await db.delete(mpNodes).where(inArray(mpNodes.id, nodeIds));
  await db.delete(vendors).where(and(eq(vendors.tenantId, TENANT_ID),
    eq(vendors.name, 'E2E FSS Farmer Vendor')));
}

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL required');
  const { db, pool } = createDb(dbUrl);

  console.log('\n=== Farmer sale → stock_ledger e2e ===\n');
  await cleanup(db);
  const priorDefault = await db.select({ id: warehouses.id }).from(warehouses)
    .where(and(eq(warehouses.tenantId, TENANT_ID), eq(warehouses.isDefault, true)));

  try {
    // ── Fixtures ────────────────────────────────────────────────────────────
    // The synthetic warehouse is made default for the run so a product sale
    // resolves to it; the tenant's real default is restored in `finally`.
    await db.update(warehouses).set({ isDefault: false })
      .where(eq(warehouses.tenantId, TENANT_ID));
    const [wh] = await db.insert(warehouses).values({
      tenantId: TENANT_ID, code: WH_CODE, name: 'E2E FSS WH', type: 'godown', isDefault: true,
    }).returning();
    const [milkItem] = await db.insert(items).values({
      tenantId: TENANT_ID, name: 'E2E FSS Raw A2', sku: MILK_SKU, type: 'product',
      itemClass: 'raw_material', unit: 'L', packSizeUqc: 'LTR',
      trackInventory: true, trackBatches: true,
    }).returning();
    const [prodItem] = await db.insert(items).values({
      tenantId: TENANT_ID, name: 'E2E FSS Ghee 500ml', sku: PROD_SKU, type: 'product',
      itemClass: 'finished_good', unit: 'nos', packSizeUqc: 'NOS',
      trackInventory: true, trackBatches: false,
    }).returning();
    await new ConfigService(db, TENANT_ID).upsertSettings({ rawMilkWarehouseId: wh.id });
    await db.insert(mpRawMilkItems).values(
      { tenantId: TENANT_ID, milkType: 'cow_a2', itemId: milkItem.id });

    const [node] = await db.insert(mpNodes).values({
      tenantId: TENANT_ID, code: NODE_VMCC, name: NODE_VMCC, nodeType: 'vmcc',
      hasBmc: false, dispatchMode: 'per_shift',
    }).returning();
    const [vendor] = await db.insert(vendors).values({
      tenantId: TENANT_ID, name: 'E2E FSS Farmer Vendor',
    }).returning();
    const [farmer] = await db.insert(mpFarmers).values({
      tenantId: TENANT_ID, vendorId: vendor.id, code: FARMER_CODE, name: 'E2E FSS Farmer',
      nodeId: node.id, defaultMilkType: 'cow_a1',
    }).returning();
    await db.insert(mpFarmerMemberships).values({
      tenantId: TENANT_ID, farmerId: farmer.id, nodeId: node.id, isPrimary: true,
    });
    // The centre pours A1 and never A2 — the shape that exposed the bug.
    await db.insert(mpPours).values({
      tenantId: TENANT_ID, nodeId: node.id, farmerId: farmer.id, collectionDate: DATE,
      shift: 'am', milkType: 'cow_a1', qtyLitres: '100', ratePerLitre: '40',
      lineAmount: '4000', baseAmount: '4000',
    });

    // Plant stock to sell out of: 60 L of A2 in one batch, 40 in another, and
    // 20 tins of ghee at ₹250.
    const ledger = new StockLedgerService(TENANT_ID);
    const seed = async (itemId: string, batchNo: string | null, qty: number, cost: number) =>
      db.transaction((tx: AnyDb) => ledger.recordMovement(tx, {
        itemId, warehouseId: wh.id, batchNo, movementType: 'grn',
        sourceType: 'e2e_seed', sourceId: node.id, qtyDelta: qty, unitCost: cost,
        movedAt: new Date(`${DATE}T00:00:00Z`),
      }));
    await seed(milkItem.id, 'E2E-FSS-B1', 60, 0);
    await seed(milkItem.id, 'E2E-FSS-B2', 40, 0);
    await seed(prodItem.id, null, 20, 250);

    const svc = new FarmerSaleService(db, TENANT_ID);
    const onHand = async (itemId: string) => {
      const rows = await db.select({ qty: stockOnHand.qty }).from(stockOnHand).where(and(
        eq(stockOnHand.tenantId, TENANT_ID), eq(stockOnHand.itemId, itemId),
        eq(stockOnHand.warehouseId, wh.id)));
      return rows.reduce((t: number, r: { qty: string }) => t + Number(r.qty), 0);
    };
    const movesFor = async (saleId: string, sourceType = 'mp_farmer_sale') =>
      db.select().from(stockLedger).where(and(
        eq(stockLedger.tenantId, TENANT_ID), eq(stockLedger.sourceType, sourceType),
        eq(stockLedger.sourceId, saleId)));
    const sell = (over: Record<string, unknown>) => svc.create({
      farmerId: farmer.id, nodeId: node.id, saleDate: DATE, kind: 'raw_milk',
      shift: 'am', qty: 10, ratePerUnit: 50, ...over,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any, ALL, undefined);

    // ── Milk the centre collected: the dispatch nets it, stock stays out ─────
    const covered = await sell({ milkType: 'cow_a1', qty: 80 });
    check('collected type → no stock movement', (await movesFor(covered.id)).length === 0);

    // ── Milk the centre never collected: it came off the plant ───────────────
    const uncovered = await sell({ milkType: 'cow_a2', qty: 80 });
    const rows = await movesFor(uncovered.id);
    check('uncollected type → stock movement posted', rows.length > 0, `${rows.length} rows`);
    check('draw totals the full qty',
      rows.reduce((t: number, r: { qtyOut: string }) => t + Number(r.qtyOut), 0) === 80);
    check('draw splits FEFO across batches', rows.length === 2,
      rows.map((r: { batchNo: string }) => r.batchNo).join(','));
    check('movement dated to the sale, not to now',
      rows.every((r: { movedAt: Date }) => r.movedAt.toISOString().startsWith(DATE)));
    check('A2 on hand 100 → 20', (await onHand(milkItem.id)) === 20);

    // ── Delete puts it back ──────────────────────────────────────────────────
    await svc.remove(uncovered.id, ALL);
    check('delete restores the stock', (await onHand(milkItem.id)) === 100);
    check('delete posts a reversal row',
      (await movesFor(uncovered.id, 'mp_farmer_sale_reversal')).length === 2);

    // ── Partial cover: only the shortfall leaves ─────────────────────────────
    // 100 L of A1 poured, 80 L already sold above, so a 40 L A1 sale is covered
    // for 20 and draws the other 20 off the plant… except A1 has no raw-milk
    // item mapped here, so it posts nothing. Use A2 with a pour instead.
    await db.insert(mpPours).values({
      tenantId: TENANT_ID, nodeId: node.id, farmerId: farmer.id, collectionDate: DATE,
      shift: 'pm', milkType: 'cow_a2', qtyLitres: '30', ratePerLitre: '50',
      lineAmount: '1500', baseAmount: '1500',
    });
    const partial = await sell({ milkType: 'cow_a2', shift: 'pm', qty: 50 });
    const pRows = await movesFor(partial.id);
    check('partial cover draws only the shortfall',
      pRows.reduce((t: number, r: { qtyOut: string }) => t + Number(r.qtyOut), 0) === 20,
      `${pRows.reduce((t: number, r: { qtyOut: string }) => t + Number(r.qtyOut), 0)} L`);

    // ── Edit re-derives: 50 → 80 means 50 off the plant, not 20 ──────────────
    await svc.update(partial.id, {
      saleDate: DATE, kind: 'raw_milk', shift: 'pm', milkType: 'cow_a2',
      qty: 80, ratePerUnit: 50,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any, ALL, undefined);
    check('edit reverses then retakes the draw', (await onHand(milkItem.id)) === 50,
      `on hand ${await onHand(milkItem.id)}`);

    // ── More than the plant holds is refused, and writes nothing ─────────────
    const before = await onHand(milkItem.id);
    const salesBefore = (await db.select().from(mpFarmerSales)
      .where(eq(mpFarmerSales.farmerId, farmer.id))).length;
    let refused = false;
    try {
      await sell({ milkType: 'cow_a2', shift: 'pm', qty: 10_000 });
    } catch (e) {
      refused = String(e).includes('in stock');
    }
    check('a sale beyond plant stock is refused', refused);
    check('the refused sale wrote nothing', (await onHand(milkItem.id)) === before
      && (await db.select().from(mpFarmerSales)
        .where(eq(mpFarmerSales.farmerId, farmer.id))).length === salesBefore);

    // ── A product: stock out at WA cost, plus the COGS entry ─────────────────
    const prodSale = await sell({ kind: 'product', itemId: prodItem.id, shift: null, qty: 4 });
    check('product sale relieves stock', (await onHand(prodItem.id)) === 16,
      `on hand ${await onHand(prodItem.id)}`);
    const je = await db.select({ id: journalEntries.id }).from(journalEntries).where(and(
      eq(journalEntries.tenantId, TENANT_ID),
      eq(journalEntries.sourceType, 'mp_farmer_sale_cogs'),
      eq(journalEntries.sourceId, prodSale.id)));
    check('product sale posts a COGS entry', je.length === 1);
    if (je.length) {
      const lines = await db.select({ code: accounts.code, debit: journalLines.debit,
        credit: journalLines.credit })
        .from(journalLines)
        .innerJoin(accounts, eq(accounts.id, journalLines.accountId))
        .where(eq(journalLines.journalEntryId, je[0].id));
      const dr = lines.find((l: { code: string }) => l.code === '5100');
      const cr = lines.find((l: { code: string }) => l.code === '1112');
      check('COGS Dr 5100 = 4 × ₹250', Number(dr?.debit) === 1000, `got ${dr?.debit}`);
      check('Inventory Cr 1112 = 4 × ₹250', Number(cr?.credit) === 1000, `got ${cr?.credit}`);
    }

    // ── Reversing the product sale contras both stock and COGS ───────────────
    await svc.reverse(prodSale.id, ALL);
    check('reversed product sale restores stock', (await onHand(prodItem.id)) === 20);
    const contra = await db.select().from(journalEntries).where(and(
      eq(journalEntries.tenantId, TENANT_ID),
      eq(journalEntries.sourceType, 'mp_farmer_sale_cogs_reversal'),
      eq(journalEntries.sourceId, prodSale.id)));
    check('reversal contras the COGS entry', contra.length === 1);

    console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed\n`);
  } finally {
    await cleanup(db);
    for (const w of priorDefault) {
      await db.update(warehouses).set({ isDefault: true }).where(eq(warehouses.id, w.id));
    }
    await pool.end();
  }
  if (fail > 0) process.exit(1);
}

void main();
