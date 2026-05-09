import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
try {
  const { rows: [priya] } = await c.query(`SELECT id FROM users WHERE email = $1`, ['priya@sharma-ca.in']);
  if (!priya) { console.log('priya not found'); process.exit(0); }
  console.log('priya id:', priya.id);

  const memberships = await c.query(
    `SELECT t.name AS tenant, t.slug, ut.role
     FROM user_tenants ut JOIN tenants t ON t.id = ut.tenant_id
     WHERE ut.user_id = $1 ORDER BY t.name`,
    [priya.id],
  );
  console.log(`\n${memberships.rowCount} memberships:`);
  console.table(memberships.rows);

  const invitesByPriya = await c.query(
    `SELECT i.invite_type, i.role, i.email, i.company_name, i.accepted_at IS NOT NULL AS accepted, t.name AS accepted_tenant
     FROM tenant_invites i
     LEFT JOIN tenants t ON t.id = i.accepted_tenant_id
     WHERE i.inviting_user_id = $1 ORDER BY i.created_at DESC`,
    [priya.id],
  );
  console.log(`\n${invitesByPriya.rowCount} invites priya issued:`);
  console.table(invitesByPriya.rows);
} finally {
  await c.end();
}
