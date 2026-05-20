// Seed the local Vrindavan tenant with a realistic leadership hierarchy
// so each role/scope path can be tested end-to-end.
//
// Org chart:
//   CEO ──┬── CFO ──┬── Admin 1
//         │         └── Admin 2
//         ├── CTO
//         ├── VP ──┬── Director 1 ──┬── SM A ──── Mgr 1, 2, 3 ── (employees)
//         │       │                 └── SM B ──── Mgr 4, 5
//         │       └── Director 2 ──┬── SM C ──── Mgr 6, 7, 8
//         │                       └── SM D ──── Mgr 9, 10
//         └── HR (head of HR dept; not a manager)
//
// All leadership users get the same test password "Test@1234". Existing
// employees are reused by employeeCode — no new rows created. Re-running
// is idempotent (every UPDATE matches on id).
//
// Run: npx tsx packages/db/scripts/seed-org-roles.ts

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { and, eq, sql } from 'drizzle-orm';
import argon2 from 'argon2';
import {
  employees, users, userTenants, departments, designations,
} from '../src/schema';

const TENANT_ID = 'a0365382-afa0-48b6-92cd-4db615a7d98b';
const PASSWORD = 'Test@1234';

interface LeaderSpec {
  code: string;                    // employees.employee_code
  email: string;                   // synthetic — overwrite if blank on emp row
  designation: string;             // designation name (create if missing)
  department: 'Administration' | 'Production' | 'Human Resources';
  reportsToCode: string | null;    // employees.employee_code; null = no manager
  systemRole: 'owner' | 'accountant' | 'hr' | 'viewer'; // users.role
}

// Top of the tree. Order matters — reportsToCode must be created/updated
// before any direct report is processed.
const TREE: LeaderSpec[] = [
  // C-suite. CEO stays 'owner' (tenant owner); CFO is 'accountant' so the
  // Finance-write role can be exercised; CTO/VP stay 'viewer' so the
  // reporting-tree scope path is still covered.
  { code: 'VD000', email: 'kailas@vrindavanmilk.com', designation: 'CEO',
    department: 'Administration', reportsToCode: null, systemRole: 'owner' },
  { code: 'VD001', email: 'cfo@vrindavan.in', designation: 'CFO',
    department: 'Administration', reportsToCode: 'VD000', systemRole: 'accountant' },
  { code: 'VD002', email: 'cto@vrindavan.in', designation: 'CTO',
    department: 'Administration', reportsToCode: 'VD000', systemRole: 'viewer' },
  { code: 'VD003', email: 'vp@vrindavan.in', designation: 'VP — Operations',
    department: 'Administration', reportsToCode: 'VD000', systemRole: 'viewer' },

  // HR — head of dept, reports to CEO. users.role = 'hr' gives tenant-wide.
  { code: 'VD050', email: 'hr@vrindavan.in', designation: 'HR Manager',
    department: 'Human Resources', reportsToCode: 'VD000', systemRole: 'hr' },

  // Admins — back-office, under CFO.
  { code: 'VD060', email: 'admin1@vrindavan.in', designation: 'Admin Officer',
    department: 'Administration', reportsToCode: 'VD001', systemRole: 'viewer' },
  { code: 'VD061', email: 'admin2@vrindavan.in', designation: 'Admin Officer',
    department: 'Administration', reportsToCode: 'VD001', systemRole: 'viewer' },

  // Directors — under VP.
  { code: 'VD004', email: 'director1@vrindavan.in', designation: 'Director',
    department: 'Production', reportsToCode: 'VD003', systemRole: 'viewer' },
  { code: 'VD005', email: 'director2@vrindavan.in', designation: 'Director',
    department: 'Production', reportsToCode: 'VD003', systemRole: 'viewer' },

  // Senior Managers — 2 under each Director.
  { code: 'VD010', email: 'sm.a@vrindavan.in', designation: 'Senior Manager',
    department: 'Production', reportsToCode: 'VD004', systemRole: 'viewer' },
  { code: 'VD011', email: 'sm.b@vrindavan.in', designation: 'Senior Manager',
    department: 'Production', reportsToCode: 'VD004', systemRole: 'viewer' },
  { code: 'VD012', email: 'sm.c@vrindavan.in', designation: 'Senior Manager',
    department: 'Production', reportsToCode: 'VD005', systemRole: 'viewer' },
  { code: 'VD013', email: 'sm.d@vrindavan.in', designation: 'Senior Manager',
    department: 'Production', reportsToCode: 'VD005', systemRole: 'viewer' },

  // Managers — 10 total, distributed 3/2/3/2 across the 4 SMs.
  { code: 'VD020', email: 'mgr1@vrindavan.in', designation: 'Manager',
    department: 'Production', reportsToCode: 'VD010', systemRole: 'viewer' },
  { code: 'VD021', email: 'mgr2@vrindavan.in', designation: 'Manager',
    department: 'Production', reportsToCode: 'VD010', systemRole: 'viewer' },
  { code: 'VD022', email: 'mgr3@vrindavan.in', designation: 'Manager',
    department: 'Production', reportsToCode: 'VD010', systemRole: 'viewer' },
  { code: 'VD023', email: 'mgr4@vrindavan.in', designation: 'Manager',
    department: 'Production', reportsToCode: 'VD011', systemRole: 'viewer' },
  { code: 'VD030', email: 'mgr5@vrindavan.in', designation: 'Manager',
    department: 'Production', reportsToCode: 'VD011', systemRole: 'viewer' },
  { code: 'VD031', email: 'mgr6@vrindavan.in', designation: 'Manager',
    department: 'Production', reportsToCode: 'VD012', systemRole: 'viewer' },
  { code: 'VD032', email: 'mgr7@vrindavan.in', designation: 'Manager',
    department: 'Production', reportsToCode: 'VD012', systemRole: 'viewer' },
  { code: 'VD033', email: 'mgr8@vrindavan.in', designation: 'Manager',
    department: 'Production', reportsToCode: 'VD012', systemRole: 'viewer' },
  { code: 'VD040', email: 'mgr9@vrindavan.in', designation: 'Manager',
    department: 'Production', reportsToCode: 'VD013', systemRole: 'viewer' },
  { code: 'VD041', email: 'mgr10@vrindavan.in', designation: 'Manager',
    department: 'Production', reportsToCode: 'VD013', systemRole: 'viewer' },
];

// Remaining employees — flat, each under one manager so the recursive
// CTE has at least a few leaves to walk. employeeCode → reportsToCode.
const EMPLOYEE_REPORTS: Array<{ code: string; reportsToCode: string }> = [
  { code: 'VD100', reportsToCode: 'VD020' },
  { code: 'VD101', reportsToCode: 'VD021' },
  { code: 'VD102', reportsToCode: 'VD022' },
  { code: 'VD103', reportsToCode: 'VD030' },
  { code: 'VD104', reportsToCode: 'VD031' },
];

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  console.log('Seeding org hierarchy for tenant', TENANT_ID);

  // 1. Ensure the HR + Production + Administration departments exist.
  for (const name of ['Human Resources', 'Administration', 'Production'] as const) {
    const code = name === 'Human Resources' ? 'HR'
      : name === 'Administration' ? 'ADM' : 'PROD';
    await db.execute(sql`
      INSERT INTO departments (tenant_id, name, code)
      VALUES (${TENANT_ID}, ${name}, ${code})
      ON CONFLICT (tenant_id, name) DO NOTHING;
    `);
  }
  const deptRows = await db
    .select({ id: departments.id, name: departments.name })
    .from(departments)
    .where(eq(departments.tenantId, TENANT_ID));
  const deptByName = new Map(deptRows.map((d) => [d.name, d.id]));

  // 2. Ensure every designation we reference exists (level loosely descending).
  const desigSpec: Array<{ name: string; level: number }> = [
    { name: 'CEO', level: 12 },
    { name: 'CFO', level: 11 },
    { name: 'CTO', level: 11 },
    { name: 'VP — Operations', level: 10 },
    { name: 'Director', level: 9 },
    { name: 'Senior Manager', level: 8 },
    { name: 'Manager', level: 7 },
    { name: 'HR Manager', level: 8 },
    { name: 'Admin Officer', level: 3 },
  ];
  for (const d of desigSpec) {
    await db.execute(sql`
      INSERT INTO designations (tenant_id, name, level, is_active)
      VALUES (${TENANT_ID}, ${d.name}, ${d.level}, TRUE)
      ON CONFLICT DO NOTHING;
    `);
  }
  const desigRows = await db
    .select({ id: designations.id, name: designations.name })
    .from(designations)
    .where(eq(designations.tenantId, TENANT_ID));
  const desigByName = new Map(desigRows.map((d) => [d.name, d.id]));

  // 3. Load existing employees we'll be re-shaping.
  const allEmps = await db
    .select({ id: employees.id, code: employees.employeeCode, email: employees.email })
    .from(employees)
    .where(eq(employees.tenantId, TENANT_ID));
  const empByCode = new Map(allEmps.map((e) => [e.code, e]));

  // 4. First pass — set department, designation, email. Reporting comes in
  //    pass 2 (everyone's id must be known before we can wire reportsTo).
  for (const s of TREE) {
    const emp = empByCode.get(s.code);
    if (!emp) {
      console.warn(`! Missing employee ${s.code} (${s.email}) — skipped`);
      continue;
    }
    const deptId = deptByName.get(s.department);
    const desigId = desigByName.get(s.designation);
    await db.update(employees)
      .set({
        departmentId: deptId,
        designationId: desigId,
        email: emp.email ?? s.email, // don't overwrite a real email
        updatedAt: new Date(),
      })
      .where(eq(employees.id, emp.id));
  }

  // 5. Second pass — wire reporting_to_id using fresh id lookups.
  for (const s of TREE) {
    const me = empByCode.get(s.code); if (!me) continue;
    const mgr = s.reportsToCode ? empByCode.get(s.reportsToCode) : null;
    await db.update(employees)
      .set({ reportingToId: mgr?.id ?? null, updatedAt: new Date() })
      .where(eq(employees.id, me.id));
  }
  for (const r of EMPLOYEE_REPORTS) {
    const me = empByCode.get(r.code); if (!me) continue;
    const mgr = empByCode.get(r.reportsToCode); if (!mgr) continue;
    await db.update(employees)
      .set({ reportingToId: mgr.id, updatedAt: new Date() })
      .where(eq(employees.id, me.id));
  }

  // 6. Sync user accounts. The phone-OTP login path historically minted a
  //    duplicate `viewer` user when an employee with an existing email
  //    account logged in on mobile — so an email may map to >1 user row.
  //    We update *every* matching row to the same role + password so a
  //    login resolves deterministically regardless of which row it picks.
  //    The owner keeps their real password; everyone else is reset to
  //    PASSWORD so web login is predictable for testing.
  const passwordHash = await argon2.hash(PASSWORD);
  for (const s of TREE) {
    const emp = empByCode.get(s.code); if (!emp) continue;
    // Use the employee's real email if one exists; else the synthetic one.
    const email = emp.email || s.email;

    // users has no unique on (tenant_id, email), so do a manual upsert.
    const existingUsers = await db.execute<{ id: string }>(sql`
      SELECT id FROM users
       WHERE tenant_id = ${TENANT_ID} AND lower(email) = lower(${email});
    `);
    if (existingUsers.rows.length === 0) {
      await db.execute(sql`
        INSERT INTO users (tenant_id, email, name, role, password_hash, is_active)
        VALUES (
          ${TENANT_ID}, ${email}, ${s.code}, ${s.systemRole}, ${passwordHash}, TRUE
        );
      `);
    } else if (s.systemRole === 'owner') {
      await db.execute(sql`
        UPDATE users
           SET role = ${s.systemRole}, is_active = TRUE, updated_at = NOW()
         WHERE tenant_id = ${TENANT_ID} AND lower(email) = lower(${email});
      `);
    } else {
      await db.execute(sql`
        UPDATE users
           SET role = ${s.systemRole}, is_active = TRUE,
               password_hash = ${passwordHash}, updated_at = NOW()
         WHERE tenant_id = ${TENANT_ID} AND lower(email) = lower(${email});
      `);
    }

    // Ensure a user_tenants membership for every matching user row, and
    // force the role on each (covers duplicate rows + role drift).
    await db.execute(sql`
      INSERT INTO user_tenants (user_id, tenant_id, role)
      SELECT u.id, ${TENANT_ID}, ${s.systemRole}
        FROM users u
       WHERE u.tenant_id = ${TENANT_ID} AND lower(u.email) = lower(${email})
         AND NOT EXISTS (
           SELECT 1 FROM user_tenants ut
            WHERE ut.user_id = u.id AND ut.tenant_id = ${TENANT_ID}
         );
    `);
    await db.execute(sql`
      UPDATE user_tenants ut
         SET role = ${s.systemRole}, updated_at = NOW()
        FROM users u
       WHERE u.id = ut.user_id
         AND u.tenant_id = ${TENANT_ID} AND lower(u.email) = lower(${email})
         AND ut.tenant_id = ${TENANT_ID};
    `);

    // Keep the employee's email in sync with their user account.
    if (!emp.email) {
      await db.update(employees)
        .set({ email, updatedAt: new Date() })
        .where(eq(employees.id, emp.id));
    }
  }

  // 7. Make the HR person the dept head — drives the dept-head scope
  //    expansion (their visible set already covers everyone via 'hr'
  //    role, but this seeds the column for testing the manager path).
  const hrEmp = empByCode.get('VD050');
  const hrDeptId = deptByName.get('Human Resources');
  if (hrEmp && hrDeptId) {
    await db.update(departments)
      .set({ headEmployeeId: hrEmp.id, updatedAt: new Date() })
      .where(eq(departments.id, hrDeptId));
  }

  // 8. Make Director 1 (VD004) the head of Production so we can test the
  //    dept-head expansion path on a non-HR scope (where it actually
  //    changes the visible set vs just reports-to).
  const dir1 = empByCode.get('VD004');
  const prodDept = deptByName.get('Production');
  if (dir1 && prodDept) {
    await db.update(departments)
      .set({ headEmployeeId: dir1.id, updatedAt: new Date() })
      .where(eq(departments.id, prodDept));
  }

  console.log('\n✓ Seed complete. Test logins (password = "Test@1234"):');
  for (const s of TREE) {
    const emp = empByCode.get(s.code); if (!emp) continue;
    const email = emp.email || s.email;
    console.log(`  ${s.designation.padEnd(20)} ${email.padEnd(34)} role=${s.systemRole}`);
  }
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
