/**
 * Seed payroll data for Vrindavan Dairy LLP:
 *   - Default salary components
 *   - 3 salary structures (Worker, Office Staff, Supervisor)
 *   - Per-employee salary assignments based on designation
 *   - Two processed payroll runs (last 2 months) using existing attendance
 *
 * Run: pnpm tsx --env-file=../../.env seeds/hr-vrindavan-payroll.ts
 */

import { Client } from 'pg';

const TENANT_SLUG = 'vrindavan-dairy-llp';

const COMPONENTS = [
  { code: 'BASIC',   name: 'Basic',              type: 'earning',    calcType: 'percent_of_ctc',   defaultValue: 40, isPfApplicable: true, isEsiApplicable: true, isTaxable: true, displayOrder: 1 },
  { code: 'HRA',     name: 'HRA',                type: 'earning',    calcType: 'percent_of_basic', defaultValue: 40, isPfApplicable: false, isEsiApplicable: false, isTaxable: true, displayOrder: 2 },
  { code: 'DA',      name: 'DA',                 type: 'earning',    calcType: 'percent_of_basic', defaultValue: 0,  isPfApplicable: true, isEsiApplicable: true, isTaxable: true, displayOrder: 3 },
  { code: 'CONV',    name: 'Conveyance',         type: 'earning',    calcType: 'fixed',            defaultValue: 1600, isPfApplicable: false, isEsiApplicable: true, isTaxable: true, displayOrder: 4 },
  { code: 'SPECIAL', name: 'Special Allowance',  type: 'earning',    calcType: 'fixed',            defaultValue: 0,  isPfApplicable: false, isEsiApplicable: true, isTaxable: true, displayOrder: 5 },
  { code: 'PF_EE',   name: 'Provident Fund',     type: 'statutory',  calcType: 'fixed',            defaultValue: 0,  isPfApplicable: false, isEsiApplicable: false, isTaxable: false, displayOrder: 50 },
  { code: 'ESI_EE',  name: 'ESI',                type: 'statutory',  calcType: 'fixed',            defaultValue: 0,  isPfApplicable: false, isEsiApplicable: false, isTaxable: false, displayOrder: 51 },
  { code: 'PT',      name: 'Professional Tax',   type: 'statutory',  calcType: 'fixed',            defaultValue: 0,  isPfApplicable: false, isEsiApplicable: false, isTaxable: false, displayOrder: 52 },
  { code: 'TDS',     name: 'TDS',                type: 'statutory',  calcType: 'fixed',            defaultValue: 0,  isPfApplicable: false, isEsiApplicable: false, isTaxable: false, displayOrder: 53 },
  { code: 'LOP',     name: 'Loss of Pay',        type: 'deduction',  calcType: 'fixed',            defaultValue: 0,  isPfApplicable: false, isEsiApplicable: false, isTaxable: false, displayOrder: 60 },
];

// Structure template — each defines (componentCode, value, calcType)
const STRUCTURES: Array<{
  name: string;
  description: string;
  lines: Array<{ code: string; value: number; calcType: string }>;
}> = [
  {
    name: 'Worker (Wage)',
    description: 'For factory wage workers — heavier Basic share, no HRA',
    lines: [
      { code: 'BASIC',   value: 60, calcType: 'percent_of_ctc' },
      { code: 'DA',      value: 20, calcType: 'percent_of_basic' },
      { code: 'CONV',    value: 1200, calcType: 'fixed' },
      { code: 'SPECIAL', value: 0,   calcType: 'fixed' },
    ],
  },
  {
    name: 'Office Staff',
    description: 'Standard office salary structure',
    lines: [
      { code: 'BASIC',   value: 40, calcType: 'percent_of_ctc' },
      { code: 'HRA',     value: 40, calcType: 'percent_of_basic' },
      { code: 'CONV',    value: 1600, calcType: 'fixed' },
      { code: 'SPECIAL', value: 0,    calcType: 'fixed' },
    ],
  },
  {
    name: 'Supervisor / Manager',
    description: 'Senior staff with higher HRA and special allowance',
    lines: [
      { code: 'BASIC',   value: 50, calcType: 'percent_of_ctc' },
      { code: 'HRA',     value: 50, calcType: 'percent_of_basic' },
      { code: 'CONV',    value: 2400, calcType: 'fixed' },
      { code: 'SPECIAL', value: 0,    calcType: 'fixed' },
    ],
  },
];

/** Pick a structure by designation name. */
function pickStructure(designation: string): string {
  const d = designation.toLowerCase();
  if (d.includes('manager') || d.includes('supervisor') || d.includes('officer') || d.includes('accountant')) {
    return 'Supervisor / Manager';
  }
  if (d.includes('executive') || d.includes('assistant')) {
    return 'Office Staff';
  }
  return 'Worker (Wage)';
}

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const tRes = await c.query(`SELECT id FROM tenants WHERE slug = $1`, [TENANT_SLUG]);
  if (!tRes.rows[0]) throw new Error(`Tenant ${TENANT_SLUG} not found`);
  const tenantId: string = tRes.rows[0].id;
  console.log(`✓ Tenant ${TENANT_SLUG} → ${tenantId}`);

  // Components
  const compIds = new Map<string, string>();
  for (const co of COMPONENTS) {
    const r = await c.query(
      `INSERT INTO salary_components
        (tenant_id, code, name, type, calc_type, default_value,
         is_pf_applicable, is_esi_applicable, is_taxable, display_order)
       VALUES ($1, $2, $3, $4::salary_component_type, $5::salary_calc_type, $6, $7, $8, $9, $10)
       ON CONFLICT (tenant_id, code) DO UPDATE SET
         name = EXCLUDED.name,
         type = EXCLUDED.type,
         calc_type = EXCLUDED.calc_type,
         default_value = EXCLUDED.default_value,
         is_pf_applicable = EXCLUDED.is_pf_applicable,
         is_esi_applicable = EXCLUDED.is_esi_applicable,
         is_taxable = EXCLUDED.is_taxable,
         display_order = EXCLUDED.display_order,
         updated_at = NOW()
       RETURNING id`,
      [tenantId, co.code, co.name, co.type, co.calcType, co.defaultValue,
       co.isPfApplicable, co.isEsiApplicable, co.isTaxable, co.displayOrder],
    );
    compIds.set(co.code, r.rows[0].id);
  }
  console.log(`✓ ${COMPONENTS.length} salary components`);

  // Structures
  const structIds = new Map<string, string>();
  for (const s of STRUCTURES) {
    const r = await c.query(
      `INSERT INTO salary_structures (tenant_id, name, description)
       VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, name) DO UPDATE SET
         description = EXCLUDED.description, updated_at = NOW()
       RETURNING id`,
      [tenantId, s.name, s.description],
    );
    const sid: string = r.rows[0].id;
    structIds.set(s.name, sid);

    // Reset lines
    await c.query(`DELETE FROM salary_structure_components WHERE salary_structure_id = $1`, [sid]);
    for (const l of s.lines) {
      const cid = compIds.get(l.code);
      if (!cid) continue;
      await c.query(
        `INSERT INTO salary_structure_components
          (tenant_id, salary_structure_id, salary_component_id, value, calc_type)
         VALUES ($1, $2, $3, $4, $5::salary_calc_type)`,
        [tenantId, sid, cid, l.value, l.calcType],
      );
    }
  }
  console.log(`✓ ${STRUCTURES.length} salary structures`);

  // Assign salary to each employee
  const empRes = await c.query(
    `SELECT e.id, e.employee_code, e.ctc_annual, d.name AS designation
     FROM employees e
     LEFT JOIN designations d ON d.id = e.designation_id
     WHERE e.tenant_id = $1 AND e.deleted_at IS NULL`,
    [tenantId],
  );

  let assigned = 0;
  for (const emp of empRes.rows) {
    const structName = pickStructure(emp.designation ?? '');
    const sid = structIds.get(structName);
    if (!sid) continue;

    // Snapshot
    const snap = await c.query(
      `SELECT sc.id AS component_id, sc.code, sc.name, sc.type, ssc.calc_type, ssc.value
       FROM salary_structure_components ssc
       JOIN salary_components sc ON sc.id = ssc.salary_component_id
       WHERE ssc.salary_structure_id = $1`,
      [sid],
    );
    const snapshot = snap.rows.map((r) => ({
      componentId: r.component_id,
      code: r.code, name: r.name, type: r.type,
      calcType: r.calc_type, value: Number(r.value),
    }));

    const ctc = Number(emp.ctc_annual ?? 240000);
    const effectiveFrom = '2025-04-01';

    // Skip if already assigned with same structure + same effectiveFrom
    const existing = await c.query(
      `SELECT id FROM employee_salary
       WHERE tenant_id = $1 AND employee_id = $2 AND effective_from = $3`,
      [tenantId, emp.id, effectiveFrom],
    );
    if (existing.rows[0]) continue;

    // Close any open assignment
    await c.query(
      `UPDATE employee_salary SET effective_to = '2025-03-31'
       WHERE tenant_id = $1 AND employee_id = $2 AND effective_to IS NULL`,
      [tenantId, emp.id],
    );

    await c.query(
      `INSERT INTO employee_salary
        (tenant_id, employee_id, salary_structure_id, ctc_annual, effective_from, components_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [tenantId, emp.id, sid, ctc, effectiveFrom, JSON.stringify(snapshot)],
    );
    assigned++;
  }
  console.log(`✓ ${assigned} employee salary assignments`);

  // Create + process payroll runs for the past 2 months
  const now = new Date();
  const months: Array<{ y: number; m: number }> = [];
  for (let i = 2; i >= 1; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ y: d.getFullYear(), m: d.getMonth() + 1 });
  }

  for (const p of months) {
    const existingRun = await c.query(
      `SELECT id FROM payroll_runs WHERE tenant_id = $1 AND year = $2 AND month = $3`,
      [tenantId, p.y, p.m],
    );
    if (existingRun.rows[0]) {
      console.log(`  ↺ ${p.y}-${String(p.m).padStart(2, '0')} run already exists, skipping`);
      continue;
    }

    const r = await c.query(
      `INSERT INTO payroll_runs (tenant_id, year, month, status, notes)
       VALUES ($1, $2, $3, 'draft', 'Seeded') RETURNING id`,
      [tenantId, p.y, p.m],
    );
    console.log(`  + payroll run ${p.y}-${String(p.m).padStart(2, '0')} (draft) — ${r.rows[0].id}`);
  }

  await c.end();
  console.log(`\n✅ Vrindavan payroll seed complete. Run "Process" on the drafts in the UI to compute payslips.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
