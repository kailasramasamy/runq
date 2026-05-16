import { Client } from 'pg';

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const TID = 'a0365382-afa0-48b6-92cd-4db615a7d98b';
  const r = await c.query(
    `SELECT d.name, COUNT(e.id)::int AS cnt
     FROM departments d
     LEFT JOIN employees e ON e.department_id = d.id AND e.deleted_at IS NULL
     WHERE d.tenant_id = $1
     GROUP BY d.name ORDER BY d.name`,
    [TID],
  );
  console.log(r.rows);
  const e = await c.query(
    `SELECT employee_code, first_name, department_id FROM employees WHERE tenant_id = $1 LIMIT 5`,
    [TID],
  );
  console.log('emps:', e.rows);
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
