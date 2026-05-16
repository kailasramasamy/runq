import { Client } from 'pg';

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const t = await c.query("select id, slug, name from tenants limit 10");
  console.log('tenants:', t.rows);
  const u = await c.query(
    "select u.id, u.email, u.tenant_id, u.role, t.slug from users u join tenants t on t.id = u.tenant_id where t.slug = 'runq-demo' limit 20",
  );
  console.log('users:', u.rows);
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
