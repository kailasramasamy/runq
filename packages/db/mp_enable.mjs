import { Client } from 'pg';
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const t = await c.query("SELECT id, slug, name, enabled_modules FROM tenants WHERE name ILIKE '%vrindavan%' OR slug ILIKE '%vrindavan%'");
  for (const row of t.rows) {
    const mods = row.enabled_modules ?? [];
    console.log(`${row.name} (${row.slug}) BEFORE:`, JSON.stringify(mods));
    if (!mods.includes('milk_procurement')) {
      const next = [...mods, 'milk_procurement'];
      await c.query('UPDATE tenants SET enabled_modules = $1::jsonb WHERE id = $2', [JSON.stringify(next), row.id]);
      console.log(`  → enabled. AFTER:`, JSON.stringify(next));
    } else {
      console.log('  already enabled');
    }
  }
  if (!t.rows.length) console.log('No vrindavan tenant found');
  await c.end();
})();
