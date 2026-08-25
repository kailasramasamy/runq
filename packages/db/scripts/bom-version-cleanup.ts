/**
 * Purge superseded BOM version rows left behind by the old edit-creates-a-new-
 * version behaviour (removed 2026-08; BomService.update now edits in place).
 *
 * A row is purged only when BOTH hold:
 *   1. it is inactive AND an active BOM shares its tenant + output item +
 *      bom_code — i.e. it is a superseded version, not a BOM someone chose to
 *      deactivate or an inactive clone;
 *   2. no work order references it, so nothing loses its audit link.
 *
 * Usage:  tsx --env-file=../../.env scripts/bom-version-cleanup.ts [--apply] [--prod]
 * Without --apply it only reports what it would delete.
 */
import { Client } from 'pg';

const apply = process.argv.includes('--apply');
const prod = process.argv.includes('--prod');
const url = prod ? process.env.PROD_DATABASE_URL : process.env.DATABASE_URL;

const PURGEABLE = `
  SELECT b.id, b.bom_code, b.name, b.version, b.created_at::date AS created
  FROM boms b
  WHERE NOT b.is_active
    AND EXISTS (SELECT 1 FROM boms a
                WHERE a.tenant_id = b.tenant_id
                  AND a.output_item_id = b.output_item_id
                  AND a.bom_code = b.bom_code
                  AND a.is_active AND a.id <> b.id)
    AND NOT EXISTS (SELECT 1 FROM work_orders w WHERE w.bom_id = b.id)
  ORDER BY b.bom_code, b.version`;

async function main(): Promise<void> {
  if (!url) throw new Error(prod ? 'PROD_DATABASE_URL is not set' : 'DATABASE_URL is not set');
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    const { rows } = await c.query(PURGEABLE);
    console.log(`${prod ? 'PROD' : 'DEV'}: ${rows.length} superseded BOM version(s) with no work orders`);
    if (rows.length > 0) console.table(rows);
    if (rows.length === 0 || !apply) {
      if (rows.length > 0) console.log('\nDry run — re-run with --apply to delete.');
      return;
    }

    const ids = rows.map((r: { id: string }) => r.id);
    await c.query('BEGIN');
    await c.query('DELETE FROM bom_lines WHERE bom_id = ANY($1::uuid[])', [ids]);
    const del = await c.query('DELETE FROM boms WHERE id = ANY($1::uuid[])', [ids]);
    await c.query('COMMIT');
    console.log(`Deleted ${del.rowCount} BOM row(s).`);
  } finally {
    await c.end();
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
