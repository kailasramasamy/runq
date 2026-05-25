/**
 * Backfill: repair stock ledger pools polluted by zero-cost inbound moves.
 *
 * Before stock-ledger.service.ts grew its "fall back to current WA cost on
 * inbound" guard, mobile adjustment_in lines went in with unit_cost = 0
 * because the mobile flow has no cost field. Each such row:
 *   • set value_delta = 0 on the adjustment line + total_value_delta = 0
 *     on the adjustment header,
 *   • silently dropped the pool's weighted-avg cost,
 *   • mis-valued every downstream outbound (transfer/delivery/adjustment).
 *
 * For each affected pool (tenant, item, warehouse, batch) we replay every
 * ledger row in chronological order with the corrected logic, then write
 * back: ledger.unit_cost / running_qty / running_value, stock_on_hand row,
 * and any inventory_adjustment_lines (value_delta, unit_cost) + header
 * total_value_delta that reference the rewritten ledger rows.
 *
 * Run with DRY_RUN=true (default) to preview, DRY_RUN=false to commit.
 * Note: this rewrites historical ledger rows in place and does NOT touch
 * the journal entries posted by InventoryGlPoster — if the corrected
 * value_delta differs from the originally posted JE, you'll need to
 * reverse + re-post those JEs separately.
 */

import { Client } from 'pg';

type Ledger = {
  id: string;
  tenant_id: string;
  item_id: string;
  warehouse_id: string;
  batch_no: string | null;
  movement_type: string;
  source_type: string;
  source_id: string;
  source_line_id: string | null;
  qty_in: string;
  qty_out: string;
  unit_cost: string;
  running_qty: string;
  running_value: string;
  moved_at: Date;
};

const DRY_RUN = (process.env.DRY_RUN ?? 'true').toLowerCase() !== 'false';
const EPS = 1e-6;

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  // 1. Find affected pools — any (tenant, item, warehouse, batch) where an
  //    inbound ledger row was recorded with unit_cost = 0.
  const pools = await c.query<{
    tenant_id: string; item_id: string; warehouse_id: string; batch_no: string | null;
  }>(`
    SELECT DISTINCT tenant_id, item_id, warehouse_id, batch_no
    FROM stock_ledger
    WHERE qty_in::numeric > 0
      AND unit_cost::numeric = 0
  `);
  console.log(`Found ${pools.rows.length} affected pool(s). DRY_RUN=${DRY_RUN}`);

  let ledgerUpdates = 0;
  let adjLineUpdates = 0;
  const adjHeaderDeltas = new Map<string, number>();
  const ohUpdates: Array<{ key: string; qty: number; avg: number; value: number }> = [];

  if (!DRY_RUN) await c.query('BEGIN');

  for (const pool of pools.rows) {
    const itemRes = await c.query<{ name: string; cost_price: string | null }>(
      `SELECT name, cost_price::text AS cost_price FROM items WHERE id = $1`,
      [pool.item_id],
    );
    const itemName = itemRes.rows[0]?.name ?? '(unknown)';
    const itemCostPrice = Number(itemRes.rows[0]?.cost_price ?? 0);

    const led = await c.query<Ledger>(
      `SELECT * FROM stock_ledger
       WHERE tenant_id = $1 AND item_id = $2 AND warehouse_id = $3
         AND batch_no IS NOT DISTINCT FROM $4
       ORDER BY moved_at, id`,
      [pool.tenant_id, pool.item_id, pool.warehouse_id, pool.batch_no],
    );

    let qty = 0, value = 0, avg = 0;
    console.log(`\n── ${itemName} @ wh ${pool.warehouse_id.slice(0, 8)}…  (${led.rows.length} moves)`);

    for (const row of led.rows) {
      const qtyIn = Number(row.qty_in);
      const qtyOut = Number(row.qty_out);
      const qtyDelta = qtyIn - qtyOut;
      const isInbound = qtyDelta > 0;
      const storedUnitCost = Number(row.unit_cost);

      // Replicate the new ledger rule: inbound with no/zero cost falls back
      // to current WA cost, then item cost_price, then 0.
      let correctedUnitCost: number;
      if (isInbound) {
        correctedUnitCost = storedUnitCost > 0
          ? storedUnitCost
          : (qty > 0 && avg > 0 ? avg : (itemCostPrice > 0 ? itemCostPrice : 0));
      } else {
        // Outbound uses pool WA cost at time of move, unless caller forced one.
        correctedUnitCost = qty > 0 ? avg : storedUnitCost;
      }

      const newQty = qty + qtyDelta;
      let newValue: number;
      let newAvg: number;
      if (isInbound) {
        newValue = value + qtyDelta * correctedUnitCost;
        newAvg = newQty > 0 ? newValue / newQty : correctedUnitCost;
      } else {
        newValue = newQty > 0 ? newQty * avg : 0;
        newAvg = newQty > 0 ? avg : 0;
      }

      const drift = {
        uc: Math.abs(correctedUnitCost - Number(row.unit_cost)) > EPS,
        rq: Math.abs(newQty - Number(row.running_qty)) > EPS,
        rv: Math.abs(newValue - Number(row.running_value)) > EPS,
      };

      if (drift.uc || drift.rq || drift.rv) {
        console.log(
          `  ${row.moved_at.toISOString().slice(0, 19)}  ${row.movement_type.padEnd(15)}` +
          `  Δq=${qtyDelta.toFixed(3).padStart(8)}` +
          `  uc ${Number(row.unit_cost).toFixed(4)} → ${correctedUnitCost.toFixed(4)}` +
          `  rv ${Number(row.running_value).toFixed(2)} → ${newValue.toFixed(2)}`,
        );
        ledgerUpdates++;
        if (!DRY_RUN) {
          await c.query(
            `UPDATE stock_ledger
             SET unit_cost = $1, running_qty = $2, running_value = $3
             WHERE id = $4`,
            [correctedUnitCost.toFixed(4), newQty.toFixed(3), newValue.toFixed(4), row.id],
          );
        }

        // Mirror corrected cost back to inventory_adjustment_lines.
        if (row.source_type === 'inventory_adjustment' && row.source_line_id) {
          const oldLine = await c.query<{ value_delta: string; unit_cost: string }>(
            `SELECT value_delta::text, unit_cost::text
             FROM inventory_adjustment_lines WHERE id = $1`,
            [row.source_line_id],
          );
          const oldVd = Number(oldLine.rows[0]?.value_delta ?? 0);
          const newVd = qtyDelta * correctedUnitCost;
          const headerDelta = newVd - oldVd;
          adjHeaderDeltas.set(
            row.source_id,
            (adjHeaderDeltas.get(row.source_id) ?? 0) + headerDelta,
          );
          adjLineUpdates++;
          if (!DRY_RUN) {
            await c.query(
              `UPDATE inventory_adjustment_lines
               SET unit_cost = $1, value_delta = $2
               WHERE id = $3`,
              [correctedUnitCost.toFixed(4), newVd.toFixed(2), row.source_line_id],
            );
          }
        }
      }

      qty = newQty;
      value = newValue;
      avg = newAvg;
    }

    ohUpdates.push({
      key: `${pool.item_id}|${pool.warehouse_id}|${pool.batch_no ?? ''}`,
      qty, avg, value,
    });

    // Refresh on-hand cache to match final replayed state.
    if (!DRY_RUN) {
      await c.query(
        `UPDATE stock_on_hand
         SET qty = $1, avg_cost = $2, value = $3
         WHERE tenant_id = $4 AND item_id = $5 AND warehouse_id = $6
           AND batch_no = $7`,
        [
          qty.toFixed(3), avg.toFixed(4), value.toFixed(4),
          pool.tenant_id, pool.item_id, pool.warehouse_id, pool.batch_no ?? '',
        ],
      );
    }
    console.log(`  final: qty=${qty.toFixed(3)}  avg=${avg.toFixed(4)}  value=${value.toFixed(2)}`);
  }

  // Roll up corrected line deltas into adjustment headers.
  console.log(`\n── adjustment header rollups (${adjHeaderDeltas.size}) ──`);
  for (const [adjId, delta] of adjHeaderDeltas) {
    const cur = await c.query<{ adj_no: string; total_value_delta: string }>(
      `SELECT adj_no, total_value_delta::text FROM inventory_adjustments WHERE id = $1`,
      [adjId],
    );
    const oldTot = Number(cur.rows[0]?.total_value_delta ?? 0);
    const newTot = oldTot + delta;
    console.log(`  ${cur.rows[0]?.adj_no}  total_value_delta ${oldTot.toFixed(2)} → ${newTot.toFixed(2)}`);
    if (!DRY_RUN) {
      await c.query(
        `UPDATE inventory_adjustments SET total_value_delta = $1 WHERE id = $2`,
        [newTot.toFixed(2), adjId],
      );
    }
  }

  if (!DRY_RUN) await c.query('COMMIT');

  console.log(`\nSummary:`);
  console.log(`  pools touched          : ${pools.rows.length}`);
  console.log(`  ledger rows rewritten  : ${ledgerUpdates}`);
  console.log(`  adjustment lines fixed : ${adjLineUpdates}`);
  console.log(`  adjustment headers     : ${adjHeaderDeltas.size}`);
  console.log(`  mode                   : ${DRY_RUN ? 'DRY RUN (no writes)' : 'COMMITTED'}`);
  if (!DRY_RUN && adjHeaderDeltas.size > 0) {
    console.log(`\n  WARNING: journal entries for the listed adjustments are now stale.`);
    console.log(`  Reverse + re-post those JEs via InventoryGlPoster, or adjust manually.`);
  }

  await c.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
