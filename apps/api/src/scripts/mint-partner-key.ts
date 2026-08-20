/**
 * Issue (or rotate) a read-only partner API key. The plaintext key is printed
 * once and never recoverable — only its hash is stored.
 *
 * Usage:
 *   pnpm --filter @runq/api exec tsx src/scripts/mint-partner-key.ts \
 *     --tenant <uuid> --slug 4amfresh --name "4amFresh consumer backend"
 *   ... --rotate    to replace the key on an existing slug
 */
import { createDb } from '@runq/db';
import { mintPartnerKey, rotatePartnerKey, PARTNER_SCOPES } from '../modules/partner-api/key.service';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  const tenantId = arg('tenant');
  const slug = arg('slug');
  const rotate = process.argv.includes('--rotate');
  if (!tenantId || !slug) {
    console.error('ERROR: --tenant <uuid> and --slug <slug> are required');
    process.exit(1);
  }

  const { db, pool } = createDb(process.env.DATABASE_URL!);
  try {
    const key = rotate
      ? await rotatePartnerKey(db, tenantId, slug)
      : await mintPartnerKey(db, tenantId, {
        slug,
        name: arg('name') ?? slug,
        scopes: [...PARTNER_SCOPES],
      });
    console.log(`\n${rotate ? 'Rotated' : 'Minted'} partner key`);
    console.log(`  slug   : ${key.slug}`);
    console.log(`  scopes : ${PARTNER_SCOPES.join(', ')}`);
    console.log(`  API key: ${key.apiKey}`);
    console.log('\nShown once. Send it to the partner over a secure channel.\n');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
