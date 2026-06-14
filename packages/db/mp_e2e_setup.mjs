import { Client } from 'pg';
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const t = await c.query("SELECT id, slug, name, enabled_modules FROM tenants WHERE slug = 'runq-demo'");
  if (!t.rows.length) { console.log('NO runq-demo tenant'); await c.end(); return; }
  const row = t.rows[0];
  console.log('tenant:', row.slug, row.id);
  console.log('enabled_modules BEFORE:', JSON.stringify(row.enabled_modules));
  if (!row.enabled_modules.includes('milk_procurement')) {
    const next = [...row.enabled_modules, 'milk_procurement'];
    await c.query('UPDATE tenants SET enabled_modules = $1::jsonb WHERE id = $2', [JSON.stringify(next), row.id]);
    console.log('enabled_modules AFTER :', JSON.stringify(next));
  } else {
    console.log('milk_procurement already enabled');
  }
  const u = await c.query(
    "SELECT u.email, ut.role FROM users u JOIN user_tenants ut ON ut.user_id = u.id WHERE u.email = 'appreview@runq.in' AND ut.tenant_id = $1",
    [row.id],
  );
  console.log('user:', JSON.stringify(u.rows));
  await c.end();
})();
