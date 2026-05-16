/**
 * One-off migration: promote vendors with category='employee' into HR
 * `employees`, and soft-delete the originals.
 *
 * History is preserved as-is: existing bills / payments / JE postings stay
 * linked to the (now soft-deleted) vendor rows, so the books don't move.
 * From here on, salary should flow through payroll runs.
 *
 * Usage:
 *   DATABASE_URL=... TENANT_ID=... tsx packages/db/scripts/migrate-employee-vendors.ts          # dry-run
 *   DATABASE_URL=... TENANT_ID=... tsx packages/db/scripts/migrate-employee-vendors.ts --apply  # write
 */
import { Client } from 'pg';

const APPLY = process.argv.includes('--apply');
const TENANT_ID = process.env.TENANT_ID;
const DEPT_NAME = 'General';

interface VendorRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  pan: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  bankName: string | null;
}

function splitName(name: string): { first: string; last: string | null } {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  const parts = trimmed.split(' ');
  if (parts.length === 1) return { first: parts[0].slice(0, 100), last: null };
  return {
    first: parts[0].slice(0, 100),
    last: parts.slice(1).join(' ').slice(0, 100),
  };
}

async function main() {
  if (!TENANT_ID) throw new Error('TENANT_ID env var required');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL env var required');

  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  console.log(`Mode: ${APPLY ? 'APPLY (writing)' : 'DRY-RUN (read-only)'}`);
  console.log(`Tenant: ${TENANT_ID}\n`);

  // 1. Fetch the vendors to migrate.
  const vendors = await c.query<VendorRow>(
    `SELECT id, name, email, phone, pan,
            bank_account_number AS "bankAccountNumber",
            bank_ifsc AS "bankIfsc",
            bank_name AS "bankName"
       FROM vendors
       WHERE tenant_id = $1 AND category = 'employee' AND deleted_at IS NULL
       ORDER BY name`,
    [TENANT_ID],
  );
  if (vendors.rowCount === 0) {
    console.log('No employee-category vendors found. Nothing to do.');
    await c.end();
    return;
  }
  console.log(`Found ${vendors.rowCount} employee-category vendors.\n`);

  // 2. Earliest bill date per vendor → joining_date.
  const ids = vendors.rows.map((v) => v.id);
  const dates = await c.query<{ vendor_id: string; earliest: string }>(
    `SELECT vendor_id, MIN(invoice_date)::text AS earliest
       FROM purchase_invoices WHERE vendor_id = ANY($1)
       GROUP BY vendor_id`,
    [ids],
  );
  const earliestByVendor = new Map(dates.rows.map((r) => [r.vendor_id, r.earliest]));

  // 3. Skip vendors already migrated (employee.vendor_id pointer set).
  const existing = await c.query<{ vendor_id: string; employee_code: string }>(
    `SELECT vendor_id, employee_code FROM employees
       WHERE tenant_id = $1 AND vendor_id = ANY($2)`,
    [TENANT_ID, ids],
  );
  const alreadyMigrated = new Map(existing.rows.map((r) => [r.vendor_id, r.employee_code]));
  if (alreadyMigrated.size > 0) {
    console.log(`Already migrated (will skip): ${alreadyMigrated.size}`);
    for (const [vid, code] of alreadyMigrated) {
      const v = vendors.rows.find((x) => x.id === vid);
      console.log(`  · ${v?.name ?? vid} → employee ${code}`);
    }
    console.log('');
  }

  const toMigrate = vendors.rows.filter((v) => !alreadyMigrated.has(v.id));
  if (toMigrate.length === 0) {
    console.log('Nothing left to migrate.');
    await c.end();
    return;
  }

  // 4. Next employee_code sequence — pick up from the highest existing EMP-####.
  const maxCode = await c.query<{ employee_code: string }>(
    `SELECT employee_code FROM employees
       WHERE tenant_id = $1 AND employee_code ~ '^EMP-[0-9]+$'
       ORDER BY employee_code DESC LIMIT 1`,
    [TENANT_ID],
  );
  let nextSeq =
    maxCode.rowCount && maxCode.rows[0]?.employee_code
      ? parseInt(maxCode.rows[0].employee_code.slice(4), 10) + 1
      : 1;

  // Run the whole thing in one transaction so a mid-flight failure rolls back.
  await c.query('BEGIN');
  try {
    // 5. Ensure the 'General' department exists.
    let dept = await c.query<{ id: string }>(
      `SELECT id FROM departments WHERE tenant_id = $1 AND name = $2 LIMIT 1`,
      [TENANT_ID, DEPT_NAME],
    );
    let deptId: string;
    if (dept.rowCount && dept.rows[0]) {
      deptId = dept.rows[0].id;
      console.log(`Department "${DEPT_NAME}" exists: ${deptId}`);
    } else if (APPLY) {
      const ins = await c.query<{ id: string }>(
        `INSERT INTO departments (tenant_id, name) VALUES ($1, $2) RETURNING id`,
        [TENANT_ID, DEPT_NAME],
      );
      deptId = ins.rows[0].id;
      console.log(`Created department "${DEPT_NAME}": ${deptId}`);
    } else {
      deptId = '<new-department-uuid>';
      console.log(`[dry-run] Would create department "${DEPT_NAME}"`);
    }

    console.log('\nPlanned employee inserts:');
    console.log('─'.repeat(80));

    for (const v of toMigrate) {
      const { first, last } = splitName(v.name);
      const joiningDate = earliestByVendor.get(v.id) ?? new Date().toISOString().slice(0, 10);
      const code = `EMP-${String(nextSeq).padStart(4, '0')}`;
      nextSeq++;

      console.log(
        `  ${code}  ${first}${last ? ' ' + last : ''}  joining=${joiningDate.slice(0, 10)}  vendor_id=${v.id}`,
      );

      if (APPLY) {
        await c.query(
          `INSERT INTO employees
             (tenant_id, employee_code, first_name, last_name, joining_date,
              status, employment_type, department_id,
              email, phone, pan,
              bank_account_number, bank_ifsc, bank_name,
              vendor_id)
           VALUES ($1, $2, $3, $4, $5,
                   'active', 'permanent', $6,
                   $7, $8, $9,
                   $10, $11, $12,
                   $13)`,
          [
            TENANT_ID, code, first, last, joiningDate.slice(0, 10),
            deptId,
            v.email, v.phone, v.pan,
            v.bankAccountNumber, v.bankIfsc, v.bankName,
            v.id,
          ],
        );
      }
    }

    // 6. Soft-delete the original vendor rows.
    console.log('\nSoft-deleting source vendor rows:');
    console.log('─'.repeat(80));
    for (const v of toMigrate) console.log(`  · ${v.name}  (${v.id})`);

    if (APPLY) {
      await c.query(
        `UPDATE vendors SET deleted_at = NOW(), updated_at = NOW()
           WHERE id = ANY($1) AND deleted_at IS NULL`,
        [toMigrate.map((v) => v.id)],
      );
    }

    if (APPLY) {
      await c.query('COMMIT');
      console.log('\n✅ Applied.');
    } else {
      await c.query('ROLLBACK');
      console.log('\n(dry-run) Rolled back. Re-run with --apply to write.');
    }
  } catch (e) {
    await c.query('ROLLBACK');
    console.error('\n❌ Migration failed; rolled back.');
    throw e;
  } finally {
    await c.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
