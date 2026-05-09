// Emit the RLS migration SQL for the current RLS_TABLES list.
// Usage: node packages/db/scripts/generate-rls-migration.mjs > packages/db/migrations/0060_rls_enable.sql
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Use a tsx-style import via dynamic — but this script is plain ESM, so just
// hand-roll the table list from the policies module. (Avoid a dep on tsx here
// so the script can be run with plain node.)
const __dirname = dirname(fileURLToPath(import.meta.url));
const policiesPath = resolve(__dirname, '..', 'src', 'rls', 'policies.ts');

import { readFileSync } from 'node:fs';
const src = readFileSync(policiesPath, 'utf8');
const match = src.match(/export const RLS_TABLES = \[([\s\S]*?)\];/);
if (!match) { console.error('Could not parse RLS_TABLES'); process.exit(1); }
const tables = [...match[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);

console.log(`-- Phase 1 hardening: enable RLS on tenant-scoped tables.
-- Generated ${new Date().toISOString()} from packages/db/src/rls/policies.ts.
--
-- IMPORTANT: Do NOT apply this migration in production until apps/api/src/plugins/db.ts
-- has been refactored to per-request connection borrowing with SET LOCAL
-- app.current_tenant_id. Otherwise, every query will see zero rows.
--
-- See docs/phase1-multi-tenant-spec.md "Phase 2 hardening" section for the
-- staged rollout plan.

`);

for (const table of tables) {
  console.log(`-- ${table}`);
  console.log(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
  console.log(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;`);
  console.log(`DROP POLICY IF EXISTS tenant_isolation_${table} ON ${table};`);
  console.log(`CREATE POLICY tenant_isolation_${table} ON ${table}`);
  console.log(`  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)`);
  console.log(`  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);`);
  console.log('');
}
