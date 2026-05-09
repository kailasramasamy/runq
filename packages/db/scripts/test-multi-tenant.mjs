// One-off script: give vaidehi@vrindavandairy.com a second tenant membership
// so we can smoke-test the Cmd-K tenant switcher in dev. Idempotent.
import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
try {
  const { rows: [u] } = await c.query(`SELECT id FROM users WHERE email = $1`, ['vaidehi@vrindavandairy.com']);
  if (!u) { console.error('user not found'); process.exit(1); }

  // Pick any tenant the user is NOT already a member of.
  const { rows: candidates } = await c.query(
    `SELECT t.id, t.name FROM tenants t
     WHERE NOT EXISTS (SELECT 1 FROM user_tenants ut WHERE ut.user_id = $1 AND ut.tenant_id = t.id)
     LIMIT 1`,
    [u.id],
  );
  if (candidates.length === 0) { console.log('user is already a member of every tenant; nothing to do'); process.exit(0); }
  const t = candidates[0];

  await c.query(
    `INSERT INTO user_tenants (user_id, tenant_id, role) VALUES ($1, $2, 'accountant')
     ON CONFLICT (user_id, tenant_id) DO NOTHING`,
    [u.id, t.id],
  );
  console.log(`added vaidehi → ${t.name} (${t.id}) as accountant`);

  const { rows: list } = await c.query(
    `SELECT t.name, ut.role FROM user_tenants ut JOIN tenants t ON t.id = ut.tenant_id WHERE ut.user_id = $1`,
    [u.id],
  );
  console.log('current memberships:'); console.table(list);
} finally {
  await c.end();
}
