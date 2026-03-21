/**
 * Idempotent RLS migration script.
 * Run with: pnpm db:rls
 *
 * What it does:
 * 1. Creates 'runq_app' role if it doesn't exist
 * 2. Grants table permissions to runq_app
 * 3. Enables RLS on all tenant-scoped tables
 * 4. Creates tenant_isolation policies (idempotent via DROP IF EXISTS)
 * 5. Smoke-tests that RLS actually blocks cross-tenant access
 */

import { Client } from 'pg';
import { RLS_TABLES, generateRLSSQL } from '../src/rls/policies';

const DATABASE_URL = process.env.DATABASE_URL;
const APP_ROLE_PASSWORD = process.env.APP_ROLE_PASSWORD;

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is required');
  process.exit(1);
}

if (!APP_ROLE_PASSWORD) {
  console.error('ERROR: APP_ROLE_PASSWORD is required');
  process.exit(1);
}

async function createRole(client: Client): Promise<void> {
  const { rows } = await client.query<{ exists: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname = 'runq_app') AS exists`,
  );

  if (rows[0]?.exists) {
    console.log('  runq_app role already exists — skipping create');
    return;
  }

  await client.query(
    `CREATE ROLE runq_app WITH LOGIN PASSWORD $1`,
    [APP_ROLE_PASSWORD],
  );
  console.log('  Created runq_app role');
}

async function grantPermissions(client: Client): Promise<void> {
  // Schema usage
  await client.query(`GRANT USAGE ON SCHEMA public TO runq_app`);

  // Table-level grants
  for (const table of RLS_TABLES) {
    await client.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ${table} TO runq_app`,
    );
  }
  // tenants table: read-only for runq_app
  await client.query(`GRANT SELECT ON TABLE tenants TO runq_app`);

  console.log(`  Granted permissions on ${RLS_TABLES.length + 1} tables`);
}

async function applyRLS(client: Client): Promise<void> {
  // Drop existing policies then recreate — makes the script idempotent
  for (const table of RLS_TABLES) {
    await client.query(`
      DROP POLICY IF EXISTS tenant_isolation_${table} ON ${table}
    `);
  }

  // generateRLSSQL() emits ALTER TABLE ... ENABLE RLS and CREATE POLICY
  const sql = generateRLSSQL();
  await client.query(sql);

  console.log(`  Applied RLS policies to ${RLS_TABLES.length} tables`);
}

async function smokeTest(client: Client): Promise<void> {
  const testTable = RLS_TABLES[0]; // 'users'

  // Set a non-existent tenant UUID so the query should return 0 rows
  const fakeTenantId = '00000000-0000-0000-0000-000000000000';

  await client.query(`SET app.current_tenant_id = $1`, [fakeTenantId]);
  const { rows } = await client.query(
    `SELECT count(*) AS n FROM ${testTable}`,
  );
  await client.query(`RESET app.current_tenant_id`);

  const count = parseInt(rows[0]?.n ?? '0', 10);
  if (count !== 0) {
    throw new Error(
      `RLS smoke test FAILED: ${testTable} returned ${count} rows for a fake tenant`,
    );
  }
  console.log(`  Smoke test passed: ${testTable} returned 0 rows for fake tenant`);
}

async function main(): Promise<void> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log('Connected to database');

  try {
    await client.query('BEGIN');

    console.log('\n[1/4] Creating runq_app role...');
    await createRole(client);

    console.log('\n[2/4] Granting permissions...');
    await grantPermissions(client);

    console.log('\n[3/4] Enabling RLS and creating policies...');
    await applyRLS(client);

    await client.query('COMMIT');

    console.log('\n[4/4] Running smoke test...');
    await smokeTest(client);

    console.log('\nRLS applied successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\nERROR — transaction rolled back:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
