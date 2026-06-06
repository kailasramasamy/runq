/**
 * Vrindavan Dairy LLP — manufacturing dogfood setup.
 *
 * Idempotent: re-running is safe. Each step uses NOT EXISTS / UPDATE so
 * partial state is reconciled to the target instead of erroring.
 *
 * What it does:
 *   1. Fix UOMs on existing raw-milk masters (A1 Milk (Raw), A2 Milk (Raw))
 *      — they were created with blank `unit`, which blocks BOM creation.
 *   2. Create the missing Raw Buffalo Milk master.
 *   3. Create the missing A1 line FGs (Milk 500ml, Curd 400g, Paneer 200g,
 *      Ghee 200g, Ghee 500g).
 *   4. Create missing A2 FGs the user listed (Paneer 200g, Ghee 200g).
 *      The 150g/500g A2 paneers + existing A2 Ghee 500g stay.
 *   5. Create missing Buffalo FGs (Ghee 200g, Ghee 500g).
 *   6. Seed 500 LTR opening stock for each of the 3 raw milks at Main Godown
 *      at realistic prices (A1 ₹70/L, A2 ₹90/L, Buffalo ₹65/L) with batches.
 *
 * Usage:
 *   tsx --env-file=../../.env apps/api/scripts/setup-vrindavan-mfg.ts
 */

import { createDb } from '@runq/db';
import { sql } from 'drizzle-orm';

const TENANT_ID = 'a0365382-afa0-48b6-92cd-4db615a7d98b'; // Vrindavan Dairy LLP
const MAIN_GODOWN = '69222aef-dacf-41ef-ae86-d0a234ed7ddd';
const TODAY = new Date().toISOString().slice(0, 10).replace(/-/g, '');

// Item rows: (name, unit, item_class, track_batches, pack_size_value, pack_size_uqc)
type ItemRow = {
  name: string;
  unit: string;
  itemClass: 'raw_material' | 'finished_good';
  trackBatches: boolean;
  packSizeValue: string;
  packSizeUqc: 'LTR' | 'KGS' | 'NOS';
};

const ITEMS: ItemRow[] = [
  // Raw milks (only Buffalo is missing; A1/A2 raw already exist and need UOM patched)
  { name: 'Raw Buffalo Milk', unit: 'LTR', itemClass: 'raw_material', trackBatches: true, packSizeValue: '1', packSizeUqc: 'LTR' },

  // A1 line (all missing)
  { name: 'A1 Milk',   unit: '500ml', itemClass: 'finished_good', trackBatches: false, packSizeValue: '0.5', packSizeUqc: 'LTR' },
  { name: 'A1 Curd',   unit: '400g',  itemClass: 'finished_good', trackBatches: false, packSizeValue: '0.4', packSizeUqc: 'KGS' },
  { name: 'A1 Paneer', unit: '200g',  itemClass: 'finished_good', trackBatches: false, packSizeValue: '0.2', packSizeUqc: 'KGS' },
  { name: 'A1 Ghee',   unit: '200g',  itemClass: 'finished_good', trackBatches: false, packSizeValue: '0.2', packSizeUqc: 'KGS' },
  { name: 'A1 Ghee',   unit: '500g',  itemClass: 'finished_good', trackBatches: false, packSizeValue: '0.5', packSizeUqc: 'KGS' },

  // A2 line (only the two missing packs)
  { name: 'A2 Paneer', unit: '200g',  itemClass: 'finished_good', trackBatches: false, packSizeValue: '0.2', packSizeUqc: 'KGS' },
  { name: 'A2 Ghee',   unit: '200g',  itemClass: 'finished_good', trackBatches: false, packSizeValue: '0.2', packSizeUqc: 'KGS' },

  // Buffalo line (Ghee variants missing)
  { name: 'Buffalo Ghee', unit: '200g', itemClass: 'finished_good', trackBatches: false, packSizeValue: '0.2', packSizeUqc: 'KGS' },
  { name: 'Buffalo Ghee', unit: '500g', itemClass: 'finished_good', trackBatches: false, packSizeValue: '0.5', packSizeUqc: 'KGS' },
];

// Opening stock seed for raw milks
const RAW_STOCK = [
  { name: 'A1 Milk (Raw)',   batch: `A1-RAW-${TODAY}-AM`,  qty: 500, wac: 70 },
  { name: 'A2 Milk (Raw)',   batch: `A2-RAW-${TODAY}-AM`,  qty: 500, wac: 90 },
  { name: 'Raw Buffalo Milk', batch: `BUF-RAW-${TODAY}-AM`, qty: 500, wac: 65 },
];

let created = 0;
let updated = 0;
let seeded = 0;

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL required');
  const { db, pool } = createDb(dbUrl);

  console.log('\n=== Vrindavan Dairy LLP — manufacturing dogfood setup ===\n');

  // ── Step 1: fix blank UOMs on existing raw-milk masters ────────────────
  console.log('1. Patching UOMs on existing raw-milk masters');
  const patched = await db.execute<{ id: string; name: string }>(sql`
    UPDATE items SET unit = 'LTR', pack_size_value = '1', pack_size_uqc = 'LTR'
    WHERE tenant_id = ${TENANT_ID}
      AND name IN ('A1 Milk (Raw)', 'A2 Milk (Raw)')
      AND (unit IS NULL OR unit = '' OR pack_size_uqc IS NULL OR pack_size_uqc = '')
    RETURNING id, name
  `);
  for (const r of patched.rows) console.log(`   ↻ patched ${r.name}`);
  updated += patched.rows.length;
  if (patched.rows.length === 0) console.log('   (already patched)');

  // ── Step 2 + 3 + 4 + 5: create missing items ───────────────────────────
  console.log('\n2. Creating missing items (raw + finished goods)');
  for (const item of ITEMS) {
    const result = await db.execute<{ id: string }>(sql`
      INSERT INTO items (
        tenant_id, name, unit, type, item_class,
        track_batches, track_inventory, is_active,
        pack_size_value, pack_size_uqc
      )
      SELECT
        ${TENANT_ID}::uuid, ${item.name}, ${item.unit}, 'product'::item_type, ${item.itemClass}::item_class,
        ${item.trackBatches}, true, true,
        ${item.packSizeValue}::numeric, ${item.packSizeUqc}
      WHERE NOT EXISTS (
        SELECT 1 FROM items
        WHERE tenant_id = ${TENANT_ID}::uuid
          AND name = ${item.name}
          AND unit = ${item.unit}
      )
      RETURNING id
    `);
    if (result.rows.length > 0) {
      console.log(`   ✓ created ${item.name} ${item.unit} (${item.itemClass})`);
      created++;
    } else {
      console.log(`   · skip   ${item.name} ${item.unit} (already exists)`);
    }
  }

  // ── Step 6: seed raw-milk stock at Main Godown ─────────────────────────
  console.log('\n3. Seeding raw-milk opening stock at Main Godown');
  for (const s of RAW_STOCK) {
    const itemRows = await db.execute<{ id: string }>(sql`
      SELECT id FROM items
      WHERE tenant_id = ${TENANT_ID}::uuid AND name = ${s.name}
      LIMIT 1
    `);
    const itemId = itemRows.rows[0]?.id;
    if (!itemId) {
      console.log(`   ✗ ${s.name} not found in master — skipping seed`);
      continue;
    }

    const existing = await db.execute<{ qty: string }>(sql`
      SELECT qty FROM stock_on_hand
      WHERE tenant_id = ${TENANT_ID}::uuid AND item_id = ${itemId}::uuid
        AND warehouse_id = ${MAIN_GODOWN}::uuid AND batch_no = ${s.batch}
    `);
    if (existing.rows.length > 0) {
      console.log(`   · skip   ${s.name} batch ${s.batch} (already seeded at ${existing.rows[0].qty} LTR)`);
      continue;
    }

    await db.execute(sql`
      INSERT INTO stock_on_hand (
        tenant_id, item_id, warehouse_id, batch_no, qty, avg_cost, value, last_movement_at
      ) VALUES (
        ${TENANT_ID}::uuid, ${itemId}::uuid, ${MAIN_GODOWN}::uuid,
        ${s.batch}, ${s.qty}, ${s.wac}, ${s.qty * s.wac}, NOW()
      )
    `);
    await db.execute(sql`
      INSERT INTO stock_ledger (
        tenant_id, item_id, warehouse_id, batch_no,
        movement_type, source_type, source_id,
        qty_in, qty_out, unit_cost, running_qty, running_value, moved_at
      ) VALUES (
        ${TENANT_ID}::uuid, ${itemId}::uuid, ${MAIN_GODOWN}::uuid, ${s.batch},
        'opening', 'dogfood_seed', gen_random_uuid(),
        ${s.qty}, 0, ${s.wac}, ${s.qty}, ${s.qty * s.wac}, NOW()
      )
    `);
    console.log(`   ✓ seeded ${s.name}: ${s.qty} LTR @ ₹${s.wac}/LTR, batch ${s.batch}`);
    seeded++;
  }

  console.log(`\n=== Done: ${created} items created, ${updated} items patched, ${seeded} raw batches seeded ===\n`);

  await pool.end();
}

main().catch((err) => {
  console.error('Setup crashed:', err);
  process.exit(1);
});
