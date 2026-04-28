/**
 * SQL runner with migration tracking — used by docker-entrypoint.sh to apply
 * hand-written migration files before drizzle-kit push runs.
 *
 * Usage: tsx scripts/run-sql.ts <path-to-sql-file>
 *
 * Each file is applied at most once. A `_migrations_applied` table tracks
 * which files have already run, so deploys skip previously-applied migrations.
 */

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
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

const migrationName = basename(file);
const sql = readFileSync(file, 'utf8');

function needsSingleQuery(text: string): boolean {
  const stripped = text.replace(/--.*$/gm, '').trim();
  return /^\s*BEGIN\b/im.test(stripped) || /\$\$/.test(stripped);
}

async function main(): Promise<void> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    // Ensure tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations_applied (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Check if already applied
    const { rows } = await client.query(
      'SELECT 1 FROM _migrations_applied WHERE name = $1',
      [migrationName],
    );
    if (rows.length > 0) {
      console.log(`  ${file} — already applied, skipping`);
      return;
    }

    // Apply migration
    if (needsSingleQuery(sql)) {
      await client.query(sql);
    } else {
      const statements = sql
        .split(/;\s*$/m)
        .map((s) => s.trim())
        // Drop fragments that contain only comment lines / whitespace.
        // (Don't reject a real statement just because it's preceded by a comment.)
        .filter((s) => s.length > 0 && s.replace(/--.*$/gm, '').trim().length > 0);
      for (const stmt of statements) {
        await client.query(stmt);
      }
    }

    // Record as applied
    await client.query(
      'INSERT INTO _migrations_applied (name) VALUES ($1) ON CONFLICT DO NOTHING',
      [migrationName],
    );
    console.log(`  ${file} applied`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`Failed to apply ${file}:`, err);
  process.exit(1);
});
