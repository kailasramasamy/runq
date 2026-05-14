/**
 * Seed contract-labour fields on existing Vrindavan wage employees + add
 * a handful of new contract workers. Sets daily_wage_rate and agency so the
 * Wage Register has meaningful data.
 *
 * Run: pnpm tsx --env-file=../../.env seeds/hr-vrindavan-contract.ts
 */

import { Client } from 'pg';

const TENANT_SLUG = 'vrindavan-dairy-llp';

const UPDATES: Array<{ code: string; dailyWageRate: number; agency?: string }> = [
  // Production wage workers
  { code: 'VD010', dailyWageRate: 600 },
  { code: 'VD011', dailyWageRate: 550 },
  { code: 'VD012', dailyWageRate: 600 },
  { code: 'VD013', dailyWageRate: 500 },
  { code: 'VD014', dailyWageRate: 500 },
  // Packaging
  { code: 'VD020', dailyWageRate: 480 },
  { code: 'VD021', dailyWageRate: 480 },
  { code: 'VD022', dailyWageRate: 450 },
  { code: 'VD023', dailyWageRate: 450 },
  // Logistics (loaders)
  { code: 'VD032', dailyWageRate: 520 },
  { code: 'VD033', dailyWageRate: 520 },
];

// Brand new contract workers via an agency
const NEW_CONTRACT: Array<{
  code: string; firstName: string; lastName: string; phone: string;
  joiningDate: string; dailyWageRate: number; agency: string;
  department: string; designation: string;
}> = [
  { code: 'VD100', firstName: 'Hari',  lastName: 'Singh',   phone: '9876543300', joiningDate: '2024-09-01', dailyWageRate: 550, agency: 'Shakti Manpower Pvt Ltd', department: 'Production', designation: 'Machine Operator' },
  { code: 'VD101', firstName: 'Kishore', lastName: 'Naik',  phone: '9876543301', joiningDate: '2024-09-01', dailyWageRate: 550, agency: 'Shakti Manpower Pvt Ltd', department: 'Production', designation: 'Machine Operator' },
  { code: 'VD102', firstName: 'Ravi',  lastName: 'Solanki', phone: '9876543302', joiningDate: '2024-11-15', dailyWageRate: 520, agency: 'Shakti Manpower Pvt Ltd', department: 'Packaging',  designation: 'Packaging Operator' },
  { code: 'VD103', firstName: 'Deepa', lastName: 'Saha',    phone: '9876543303', joiningDate: '2025-01-10', dailyWageRate: 480, agency: 'Aakar Staffing',         department: 'Packaging',  designation: 'Packaging Operator' },
  { code: 'VD104', firstName: 'Mukesh', lastName: 'Tiwari', phone: '9876543304', joiningDate: '2025-02-01', dailyWageRate: 500, agency: 'Aakar Staffing',         department: 'Logistics',  designation: 'Loader' },
];

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const tRes = await c.query(`SELECT id FROM tenants WHERE slug = $1`, [TENANT_SLUG]);
  if (!tRes.rows[0]) throw new Error(`Tenant ${TENANT_SLUG} not found`);
  const tenantId: string = tRes.rows[0].id;
  console.log(`✓ Tenant ${TENANT_SLUG} → ${tenantId}`);

  // 1. Update existing wage workers
  let updated = 0;
  for (const u of UPDATES) {
    const r = await c.query(
      `UPDATE employees
       SET daily_wage_rate = $1, agency = COALESCE($2, agency), updated_at = NOW()
       WHERE tenant_id = $3 AND employee_code = $4 AND deleted_at IS NULL`,
      [u.dailyWageRate, u.agency ?? null, tenantId, u.code],
    );
    if (r.rowCount && r.rowCount > 0) updated += r.rowCount;
  }
  console.log(`✓ Updated daily_wage_rate on ${updated} existing wage workers`);

  // 2. Lookup dept + designation ids for new contract workers
  const depts = await c.query(
    `SELECT id, name FROM departments WHERE tenant_id = $1`, [tenantId],
  );
  const desigs = await c.query(
    `SELECT id, name FROM designations WHERE tenant_id = $1`, [tenantId],
  );
  const deptByName = new Map(depts.rows.map((r) => [r.name, r.id]));
  const desigByName = new Map(desigs.rows.map((r) => [r.name, r.id]));

  let inserted = 0;
  for (const n of NEW_CONTRACT) {
    const deptId = deptByName.get(n.department);
    const desigId = desigByName.get(n.designation);
    if (!deptId || !desigId) {
      console.warn(`  ⚠ skipping ${n.code} — missing dept/desig`);
      continue;
    }
    const r = await c.query(
      `INSERT INTO employees (
         tenant_id, employee_code, first_name, last_name, phone,
         joining_date, employment_type, department_id, designation_id,
         agency, daily_wage_rate, status
       ) VALUES (
         $1, $2, $3, $4, $5, $6, 'contract'::employment_type, $7, $8,
         $9, $10, 'active'::employee_status
       )
       ON CONFLICT (tenant_id, employee_code) DO UPDATE SET
         first_name = EXCLUDED.first_name,
         last_name = EXCLUDED.last_name,
         phone = EXCLUDED.phone,
         employment_type = EXCLUDED.employment_type,
         agency = EXCLUDED.agency,
         daily_wage_rate = EXCLUDED.daily_wage_rate,
         updated_at = NOW()
       RETURNING id`,
      [
        tenantId, n.code, n.firstName, n.lastName, n.phone,
        n.joiningDate, deptId, desigId, n.agency, n.dailyWageRate,
      ],
    );
    if (r.rows[0]) inserted++;
  }
  console.log(`✓ Upserted ${inserted} new contract workers (with agency)`);

  // 3. Seed 14 days of attendance for the new contract workers, similar to others
  const today = new Date();
  let attCount = 0;
  for (const n of NEW_CONTRACT) {
    const emp = await c.query(
      `SELECT id FROM employees WHERE tenant_id = $1 AND employee_code = $2`,
      [tenantId, n.code],
    );
    const empId = emp.rows[0]?.id;
    if (!empId) continue;

    for (let dayOffset = 13; dayOffset >= 0; dayOffset--) {
      const d = new Date(today);
      d.setDate(today.getDate() - dayOffset);
      const date = d.toISOString().slice(0, 10);
      const dow = d.getUTCDay();
      if (dow === 0) {
        await c.query(
          `INSERT INTO attendance (tenant_id, employee_id, date, status, source)
           VALUES ($1, $2, $3, 'week_off'::attendance_status, 'manual')
           ON CONFLICT (employee_id, date) DO NOTHING`,
          [tenantId, empId, date],
        );
        attCount++;
        continue;
      }
      const rng = Math.random();
      let status: string = 'present';
      let checkIn: string | null = '08:00';
      let checkOut: string | null = '17:00';
      if (rng < 0.05) { status = 'absent'; checkIn = null; checkOut = null; }
      else if (rng < 0.10) { status = 'half_day'; checkOut = '12:30'; }
      await c.query(
        `INSERT INTO attendance (tenant_id, employee_id, date, check_in, check_out, status, source)
         VALUES ($1, $2, $3, $4, $5, $6::attendance_status, 'manual')
         ON CONFLICT (employee_id, date) DO NOTHING`,
        [tenantId, empId, date, checkIn, checkOut, status],
      );
      attCount++;
    }
  }
  console.log(`✓ Attendance for new contract workers: ${attCount} records`);

  await c.end();
  console.log('\n✅ Vrindavan contract-labour seed complete.');
  console.log('   View at /finance/hr/contract-labour');
}

main().catch((e) => { console.error(e); process.exit(1); });
