import { Client } from 'pg';
import { writeFileSync } from 'node:fs';

const TODAY = '2026-06-14';
const round1 = (n) => Math.round(n * 10) / 10;

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const { rows: [t] } = await c.query(
    "SELECT id, name FROM tenants WHERE name ILIKE '%vrindavan%' OR slug ILIKE '%vrindavan%' LIMIT 1",
  );
  if (!t) { console.log('No vrindavan tenant'); await c.end(); return; }

  // build FAT 3.2–5.0 × SNF 6.5–9.0 in 0.1 steps
  const cells = [];
  for (let f = 32; f <= 50; f++) {
    for (let s = 65; s <= 90; s++) {
      const fat = f / 10, snf = s / 10;
      cells.push({ fat, snf, rate: round1(fat * 6 + snf * 2.5) });
    }
  }

  // paste-able text for the UI form
  const text = cells.map((x) => `${x.fat.toFixed(1)}, ${x.snf.toFixed(1)}, ${x.rate}`).join('\n');
  writeFileSync('/tmp/dhenu_rate_chart.txt', text);

  // create the chart
  const { rows: [chart] } = await c.query(
    `INSERT INTO mp_rate_charts (tenant_id, name, milk_type, pricing_mode, effective_from, is_active)
     VALUES ($1, 'Cow FAT/SNF (3.2–5.0 × 6.5–9.0)', 'cow', 'matrix', $2, true) RETURNING id`,
    [t.id, TODAY],
  );
  const valuesSql = cells.map((x) => `(${x.fat},${x.snf},${x.rate})`).join(',');
  await c.query(
    `INSERT INTO mp_rate_chart_cells (tenant_id, rate_chart_id, fat, snf, rate_per_litre)
     SELECT $1, $2, v.fat, v.snf, v.rate FROM (VALUES ${valuesSql}) AS v(fat,snf,rate)`,
    [t.id, chart.id],
  );
  await c.query(
    `INSERT INTO mp_rate_chart_rules (tenant_id, rate_chart_id, rule_type, grade, bonus_per_litre)
     VALUES ($1, $2, 'quality_bonus', 'a', 1.0)`,
    [t.id, chart.id],
  );

  console.log(`Created chart ${chart.id} on "${t.name}" with ${cells.length} cells + Grade-A bonus.`);
  console.log('Corners:',
    `3.2/6.5=${round1(3.2 * 6 + 6.5 * 2.5)}`,
    `3.2/9.0=${round1(3.2 * 6 + 9.0 * 2.5)}`,
    `5.0/6.5=${round1(5.0 * 6 + 6.5 * 2.5)}`,
    `5.0/9.0=${round1(5.0 * 6 + 9.0 * 2.5)}`);
  console.log('Paste-able cells written to /tmp/dhenu_rate_chart.txt');
  await c.end();
})();
