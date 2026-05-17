/**
 * Seed a "first-level employee" test account in the Vrindavan Dairy tenant.
 *
 * Creates (idempotently, by email):
 *   - employees row  — leaf node: no reportingToId on others, heads no dept
 *   - users row      — role `viewer`
 *   - user_tenants   — links the user to the tenant as `viewer`
 *
 * Email match between users.email and employees.email is what triggers the
 * `self` scope in apps/api/src/modules/hr/access-scope.ts.
 *
 * Run from repo root:
 *   DATABASE_URL=postgresql://runq_app:runq_dev_pass@localhost:5432/runq_dev \
 *     pnpm --filter @runq/api tsx scripts/seed-test-employee.ts
 */

import { Client } from 'pg';
import argon2 from 'argon2';

const TENANT_ID = 'a0365382-afa0-48b6-92cd-4db615a7d98b'; // Vrindavan Dairy LLP
const EMAIL = 'testworker@vrindavan.in';
const PASSWORD = 'test1234';
const NAME = 'Test Worker';
const EMP_CODE = 'VDTEST1';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL required');
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    const hash = await argon2.hash(PASSWORD);

    // users — upsert by (tenant_id, email)
    const u = await c.query(
      `INSERT INTO users (tenant_id, email, name, role, password_hash, is_active)
       VALUES ($1, $2, $3, 'viewer', $4, true)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [TENANT_ID, EMAIL, NAME, hash],
    );
    let userId: string;
    if (u.rows[0]) {
      userId = u.rows[0].id;
      console.log('users: inserted', userId);
    } else {
      const r = await c.query(
        `SELECT id FROM users WHERE tenant_id=$1 AND email=$2`,
        [TENANT_ID, EMAIL],
      );
      userId = r.rows[0].id;
      // Refresh password so the documented one always works on re-runs.
      await c.query(`UPDATE users SET password_hash=$1, role='viewer', is_active=true WHERE id=$2`, [hash, userId]);
      console.log('users: updated existing', userId);
    }

    await c.query(
      `INSERT INTO user_tenants (user_id, tenant_id, role)
       VALUES ($1, $2, 'viewer')
       ON CONFLICT (user_id, tenant_id) DO UPDATE SET role='viewer'`,
      [userId, TENANT_ID],
    );

    // employees — leaf: no reportingToId, will not be assigned as head/parent
    const e = await c.query(
      `INSERT INTO employees
         (tenant_id, employee_code, first_name, last_name, email,
          joining_date, status, employment_type)
       VALUES ($1, $2, 'Test', 'Worker', $3,
               CURRENT_DATE, 'active', 'permanent')
       ON CONFLICT (tenant_id, employee_code) DO UPDATE
         SET email = EXCLUDED.email, status = 'active'
       RETURNING id`,
      [TENANT_ID, EMP_CODE, EMAIL],
    );
    console.log('employees: ok', e.rows[0].id);

    console.log('\n--- LOGIN ---');
    console.log('email   :', EMAIL);
    console.log('password:', PASSWORD);
    console.log('tenant  : Vrindavan Dairy LLP');
    console.log('role    : viewer (HR scope → self)');
  } finally {
    await c.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
