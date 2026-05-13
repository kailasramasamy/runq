/**
 * Migrate old hex portal slugs to human-readable, nickname-based ones.
 *
 * Targets customers whose existing portal_slug matches /^[a-f0-9]{8}$/
 * (the old random format). Leaves already-renamed slugs alone.
 *
 * Usage:
 *   DATABASE_URL=... pnpm tsx packages/db/scripts/migrate-portal-slugs.ts [--dry]
 *
 * Flags:
 *   --dry   Print proposed changes without writing.
 */

import { Client } from 'pg';
import { randomBytes } from 'node:crypto';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL required');
  process.exit(1);
}

const DRY_RUN = process.argv.includes('--dry');

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 27);
}

async function isSlugTaken(client: Client, slug: string, excludeId: string): Promise<boolean> {
  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM customers WHERE portal_slug = $1 AND id <> $2 LIMIT 1`,
    [slug, excludeId],
  );
  return rows.length > 0;
}

async function allocateSlug(
  client: Client,
  customerId: string,
  source: string,
): Promise<string | null> {
  const base = slugify(source);
  if (!base) return null;
  if (!(await isSlugTaken(client, base, customerId))) return base;
  for (let i = 0; i < 5; i++) {
    const candidate = `${base}-${randomBytes(2).toString('hex')}`;
    if (!(await isSlugTaken(client, candidate, customerId))) return candidate;
  }
  return null;
}

async function main(): Promise<void> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{
      id: string;
      tenant_id: string;
      portal_slug: string;
      nickname: string | null;
      name: string;
    }>(
      `SELECT id, tenant_id, portal_slug, nickname, name
         FROM customers
        WHERE portal_slug ~ '^[a-f0-9]{8}$'
        ORDER BY name`,
    );

    console.log(`Found ${rows.length} customer(s) with legacy hex slugs.`);
    if (rows.length === 0) return;

    let migrated = 0;
    let skipped = 0;
    for (const c of rows) {
      const source = (c.nickname && c.nickname.trim()) || c.name;
      const newSlug = await allocateSlug(client, c.id, source);
      if (!newSlug || newSlug === c.portal_slug) {
        console.log(`  [skip] ${c.name} — could not derive a slug from "${source}"`);
        skipped++;
        continue;
      }
      console.log(`  ${c.portal_slug}  →  ${newSlug}   (${c.name})`);
      if (!DRY_RUN) {
        await client.query(`UPDATE customers SET portal_slug = $1 WHERE id = $2`, [newSlug, c.id]);
      }
      migrated++;
    }

    console.log('');
    console.log(`${DRY_RUN ? '[DRY RUN] Would migrate' : 'Migrated'}: ${migrated}`);
    console.log(`Skipped: ${skipped}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
