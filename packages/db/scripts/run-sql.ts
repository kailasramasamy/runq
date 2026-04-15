/**
 * Tiny SQL runner used by docker-entrypoint.sh to apply hand-written
 * migration files (e.g. table renames that drizzle-kit push cannot
 * express safely) before drizzle-kit push runs.
 *
 * Usage: tsx scripts/run-sql.ts <path-to-sql-file>
 *
 * Each SQL file must be idempotent — it will be executed on every
 * container start.
 */

import { readFileSync } from 'node:fs';
import { Client } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
const file = process.argv[2];

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is required');
  process.exit(1);
}

if (!file) {
  console.error('ERROR: pass a SQL file path as the first argument');
  process.exit(1);
}

const sql = readFileSync(file, 'utf8');

async function main(): Promise<void> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    // Split on semicolons and execute each statement individually.
    // This avoids PostgreSQL batching issues (e.g., ADD COLUMN IF NOT EXISTS
    // validating column limits across all statements in a single query).
    const statements = sql
      .split(/;\s*$/m)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('--'));

    for (const stmt of statements) {
      await client.query(stmt);
    }
    console.log(`  ${file} applied`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`Failed to apply ${file}:`, err);
  process.exit(1);
});
