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

  // Postgres does not support parameter bindings ($1) for DDL — the password
  // has to be inlined. client.escapeLiteral() handles SQL-safe quoting.
  const escapedPassword = client.escapeLiteral(APP_ROLE_PASSWORD!);
  await client.query(
    `CREATE ROLE runq_app WITH LOGIN PASSWORD ${escapedPassword}`,
  );
  console.log('  Created runq_app role');
}

/**
 * Existence-filtered table list. Earlier versions of the policy list have
 * referenced tables that were later dropped (e.g. `vendor_bill_item_aliases`
 * was retired by migration 0116). The grant/policy loops would crash on
 * the first missing table and abort the whole transaction, taking the API
 * boot with it. Filter to actually-present tables up front so a stale
 * entry in `RLS_TABLES` degrades to a one-time warning instead of an
 * outage.
 */
async function existingRlsTables(client: Client): Promise<string[]> {
  if (RLS_TABLES.length === 0) return [];
  const { rows } = await client.query<{ table_name: string }>(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])`,
    [RLS_TABLES],
  );
  const present = new Set(rows.map((r) => r.table_name));
  const missing = RLS_TABLES.filter((t) => !present.has(t));
  if (missing.length > 0) {
    console.warn(
      `  WARN: ${missing.length} table(s) in RLS_TABLES not present — skipping: ${missing.join(', ')}`,
    );
  }
  return RLS_TABLES.filter((t) => present.has(t));
}

async function grantPermissions(client: Client, tables: string[]): Promise<void> {
  // Schema usage
  await client.query(`GRANT USAGE ON SCHEMA public TO runq_app`);

  // Table-level grants
  for (const table of tables) {
    await client.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ${table} TO runq_app`,
    );
  }
  // tenants table: read-only for runq_app
  await client.query(`GRANT SELECT ON TABLE tenants TO runq_app`);

  console.log(`  Granted permissions on ${tables.length + 1} tables`);
}

async function applyRLS(client: Client, tables: string[]): Promise<void> {
  // Drop existing policies then recreate — makes the script idempotent
  for (const table of tables) {
    await client.query(`
      DROP POLICY IF EXISTS tenant_isolation_${table} ON ${table}
    `);
  }

  // generateRLSSQL() emits ALTER TABLE ... ENABLE RLS and CREATE POLICY
  // for every table in RLS_TABLES. We filter the SQL output to only the
  // statements for tables that exist.
  const sql = generateRLSSQL();
  const filtered = filterRlsSqlToPresentTables(sql, tables);
  await client.query(filtered);

  console.log(`  Applied RLS policies to ${tables.length} tables`);
}

/**
 * `generateRLSSQL()` is offline (no DB access) and emits statements for
 * every table in `RLS_TABLES`. When a table was dropped post-list-update,
 * we strip out its ALTER/CREATE POLICY block. Identifier matching is
 * line-based + regex-safe because `generateRLSSQL` uses a known template.
 */
function filterRlsSqlToPresentTables(sql: string, present: string[]): string {
  const presentSet = new Set(present);
  const stmts = sql.split(/;\s*\n/);
  return stmts
    .filter((stmt) => {
      const m = stmt.match(/ALTER TABLE\s+(\w+)|ON\s+(\w+)/);
      if (!m) return true;
      const table = (m[1] ?? m[2])!;
      return presentSet.has(table) || !RLS_TABLES.includes(table);
    })
    .join(';\n');
}

async function smokeTest(client: Client): Promise<void> {
  const testTable = RLS_TABLES[0]; // 'users'

  // Set a non-existent tenant UUID so the query should return 0 rows
  const fakeTenantId = '00000000-0000-0000-0000-000000000000';

  // The migration connection is a superuser, which bypasses RLS even with
  // FORCE ROW LEVEL SECURITY. SET ROLE to runq_app (the non-bypass app role)
  // so the policy actually filters during the smoke test.
  await client.query(`SET ROLE runq_app`);
  try {
    // SET does not accept $N parameter bindings — use set_config() which is
    // a regular function call inside a SELECT and does.
    await client.query(
      `SELECT set_config('app.current_tenant_id', $1, false)`,
      [fakeTenantId],
    );
    const { rows } = await client.query(
      `SELECT count(*) AS n FROM ${testTable}`,
    );

    const count = parseInt(rows[0]?.n ?? '0', 10);
    if (count !== 0) {
      throw new Error(
        `RLS smoke test FAILED: ${testTable} returned ${count} rows for a fake tenant`,
      );
    }
  } finally {
    await client.query(`RESET ROLE`);
    await client.query(`RESET app.current_tenant_id`);
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

    // Resolve which tables actually exist before issuing GRANTs / policy
    // statements. Stale entries in RLS_TABLES (from dropped tables) used
    // to crash prod boot — see commit history for migration 0116.
    const presentTables = await existingRlsTables(client);

    console.log('\n[2/4] Granting permissions...');
    await grantPermissions(client, presentTables);

    console.log('\n[3/4] Enabling RLS and creating policies...');
    await applyRLS(client, presentTables);

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
