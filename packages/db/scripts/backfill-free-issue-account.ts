/**
 * Backfill: create account 5106 "Free Issues & Trade Allowance" for every
 * existing tenant.
 *
 * The account is seeded for new tenants by standard-chart-of-accounts.ts, but
 * GLService.resolveAccountCodes throws when a code is missing — so without
 * this, the first free-issue adjustment on an existing tenant fails to post.
 *
 * Parented under 5100 (Cost of Goods Sold) to match 5104 / 5105. Tenants
 * without a 5100 are skipped and reported rather than silently reparented.
 *
 * Run with DRY_RUN=true (default) to preview, DRY_RUN=false to commit:
 *   DATABASE_URL=... DRY_RUN=false pnpm tsx packages/db/scripts/backfill-free-issue-account.ts
 */

import { Client } from 'pg';

const DRY_RUN = (process.env.DRY_RUN ?? 'true').toLowerCase() !== 'false';

const CODE = '5106';
const NAME = 'Free Issues & Trade Allowance';
const PARENT_CODE = '5100';

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const { rows: tenants } = await c.query<{ id: string; name: string }>(
    'SELECT id, name FROM tenants ORDER BY name',
  );

  let created = 0;
  const skipped: string[] = [];

  for (const t of tenants) {
    const { rows } = await c.query<{ code: string; id: string }>(
      "SELECT code, id FROM accounts WHERE tenant_id = $1 AND code = ANY($2::text[])",
      [t.id, [CODE, PARENT_CODE]],
    );
    if (rows.some((r) => r.code === CODE)) continue;

    const parentId = rows.find((r) => r.code === PARENT_CODE)?.id;
    if (!parentId) {
      skipped.push(`${t.name} — no ${PARENT_CODE} account to parent under`);
      continue;
    }

    console.log(`${DRY_RUN ? '[dry-run] ' : ''}${t.name}: create ${CODE} ${NAME}`);
    if (!DRY_RUN) {
      await c.query(
        `INSERT INTO accounts (tenant_id, code, name, type, parent_id, is_system_account)
         VALUES ($1, $2, $3, 'expense', $4, true)`,
        [t.id, CODE, NAME, parentId],
      );
    }
    created++;
  }

  console.log(`\n${DRY_RUN ? 'Would create' : 'Created'} ${created} account(s).`);
  if (skipped.length > 0) {
    console.log(`Skipped ${skipped.length}:`);
    for (const s of skipped) console.log(`  - ${s}`);
  }
  await c.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
