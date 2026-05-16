import { Client } from 'pg';

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  await c.query(`SET LOCAL row_security = off`);
  const ss = await c.query(`
    SELECT s.id, s.name, s.tenant_id,
      (SELECT count(*) FROM salary_structure_components ssc WHERE ssc.salary_structure_id = s.id) AS comp_count
    FROM salary_structures s
    ORDER BY s.created_at DESC LIMIT 5
  `);
  console.log('latest structures:', ss.rows);
  const ssc = await c.query(`SELECT count(*) FROM salary_structure_components`);
  console.log('total ssc rows:', ssc.rows);
  const tot = await c.query(`SELECT count(*) FROM salary_structures`);
  console.log('total structures:', tot.rows);

  const es = await c.query(`
    SELECT id, employee_id, salary_structure_id, ctc_annual,
           jsonb_array_length(components_snapshot) AS snap_len,
           components_snapshot
    FROM employee_salary
    ORDER BY created_at DESC LIMIT 5
  `);
  console.log('latest employee salaries:', es.rows);

  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
