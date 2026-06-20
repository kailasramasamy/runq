/**
 * One-off: machine-seed native-script names for existing farmers (RL display).
 *
 * Usage: tsx src/scripts/seed-farmer-native-names.ts <lang> [tenantId]
 *   <lang>     target language code — ta | kn | hi | te | ml | gu | bn
 *   [tenantId] limit to one tenant (recommended — a tenant has one language)
 *
 * Only fills rows where name_native IS NULL; seeded rows are left unverified
 * (name_native_verified = false) for operators to confirm. Needs DATABASE_URL
 * and ANTHROPIC_API_KEY in the environment.
 */
import { Client } from 'pg';
import { transliterateNames } from '../modules/milk-procurement/transliteration.service';

const BATCH = 25;
const lang = process.argv[2];
const tenantId = process.argv[3];

async function main(): Promise<void> {
  if (!lang) throw new Error('pass a target language code, e.g. `ta`');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const where = tenantId ? 'AND tenant_id = $1' : '';
    const { rows } = await client.query<{ id: string; name: string }>(
      `SELECT id, name FROM mp_farmers
       WHERE name_native IS NULL AND deleted_at IS NULL ${where}`,
      tenantId ? [tenantId] : [],
    );
    console.log(`${rows.length} farmers to seed (${lang})`);

    let filled = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const natives = await transliterateNames(batch.map((r) => r.name), lang);
      for (let j = 0; j < batch.length; j++) {
        const native = natives[j];
        if (!native) continue; // AI off / unmapped → leave null, retry later
        await client.query(
          'UPDATE mp_farmers SET name_native = $1, name_native_verified = false WHERE id = $2',
          [native, batch[j]!.id],
        );
        filled++;
      }
      console.log(`  ${Math.min(i + BATCH, rows.length)}/${rows.length} processed`);
    }
    console.log(`done — seeded ${filled} of ${rows.length}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('seed failed:', err);
  process.exit(1);
});
