/**
 * One-shot: stamp external_refs.vrindavan-ops on runq vendors that correspond
 * to ops CPPs (collection point persons).
 *
 *   cd apps/api
 *   node --env-file=../../.env --import tsx src/scripts/backfill-cpp-external-refs.ts \
 *     --tenant <TENANT_UUID> --csv /path/to/cpps.csv [--apply]
 *
 * CSV format (with header row):  cpp_id,cpp_name
 *
 * Without --apply, runs as a dry-run printing the proposed mapping.
 */

import { readFileSync } from 'node:fs';
import { eq, and, ilike, sql } from 'drizzle-orm';
import { createDb, vendors } from '@runq/db';

interface OpsCpp { cppId: string; name: string }

interface MatchResult {
  cpp: OpsCpp;
  vendorId: string | null;
  matchType: 'exact' | 'ilike' | 'firstword' | 'none' | 'ambiguous';
  candidates?: Array<{ id: string; name: string }>;
}

const SOURCE_SLUG = 'vrindavan-ops';

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  return {
    tenantId: get('--tenant'),
    csvPath: get('--csv'),
    apply: args.includes('--apply'),
  };
}

function readCpps(csvPath: string): OpsCpp[] {
  const text = readFileSync(csvPath, 'utf8');
  const lines = text.replace(/\r\n/g, '\n').trim().split('\n').filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0]!.split(',').map((s) => s.trim().toLowerCase());
  const idIdx = headers.indexOf('cpp_id');
  const nameIdx = headers.indexOf('cpp_name');
  if (idIdx < 0 || nameIdx < 0) {
    throw new Error('CSV must have headers: cpp_id, cpp_name');
  }
  return lines.slice(1).map((line) => {
    const cols = line.split(',').map((s) => s.trim());
    return { cppId: cols[idIdx] ?? '', name: cols[nameIdx] ?? '' };
  }).filter((c) => c.cppId && c.name);
}

type DbT = ReturnType<typeof createDb>['db'];

async function matchCpp(db: DbT, tenantId: string, cpp: OpsCpp): Promise<MatchResult> {
  const exact = await db.select({ id: vendors.id, name: vendors.name }).from(vendors)
    .where(and(eq(vendors.tenantId, tenantId), eq(vendors.name, cpp.name)));
  if (exact.length === 1) return { cpp, vendorId: exact[0]!.id, matchType: 'exact' };

  const partial = await db.select({ id: vendors.id, name: vendors.name }).from(vendors)
    .where(and(eq(vendors.tenantId, tenantId), ilike(vendors.name, `%${cpp.name}%`)));
  if (partial.length === 1) return { cpp, vendorId: partial[0]!.id, matchType: 'ilike' };
  if (partial.length > 1) return { cpp, vendorId: null, matchType: 'ambiguous', candidates: partial };

  const firstWord = cpp.name.split(/\s+/)[0];
  if (firstWord && firstWord.length >= 3) {
    const fw = await db.select({ id: vendors.id, name: vendors.name }).from(vendors)
      .where(and(eq(vendors.tenantId, tenantId), ilike(vendors.name, `${firstWord}%`)));
    if (fw.length === 1) return { cpp, vendorId: fw[0]!.id, matchType: 'firstword' };
    if (fw.length > 1) return { cpp, vendorId: null, matchType: 'ambiguous', candidates: fw };
  }

  return { cpp, vendorId: null, matchType: 'none' };
}

async function main() {
  const { tenantId, csvPath, apply } = parseArgs();
  if (!tenantId || !csvPath) {
    console.error('Usage: backfill-cpp-external-refs.ts --tenant <UUID> --csv <PATH> [--apply]');
    process.exit(1);
  }

  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL is required'); process.exit(1); }
  const { db, pool } = createDb(url);
  const cpps = readCpps(csvPath);
  console.log(`Loaded ${cpps.length} CPPs from ${csvPath}\n`);

  const matches: MatchResult[] = [];
  for (const cpp of cpps) {
    matches.push(await matchCpp(db, tenantId, cpp));
  }

  const byType = matches.reduce<Record<string, number>>((acc, m) => {
    acc[m.matchType] = (acc[m.matchType] ?? 0) + 1;
    return acc;
  }, {});
  console.log('Match summary:', byType);
  console.log();

  for (const m of matches) {
    if (m.matchType === 'none') {
      console.log(`  [no match]   ${m.cpp.cppId.padEnd(8)} ${m.cpp.name}`);
    } else if (m.matchType === 'ambiguous') {
      console.log(`  [ambiguous]  ${m.cpp.cppId.padEnd(8)} ${m.cpp.name}`);
      m.candidates?.forEach((c) => console.log(`               → ${c.name} (${c.id})`));
    }
  }

  if (!apply) {
    console.log('\nDry run. Re-run with --apply to stamp external_refs.');
    process.exit(0);
  }

  const stampable = matches.filter((m) => m.vendorId);
  let updated = 0;
  for (const m of stampable) {
    await db.update(vendors)
      .set({
        externalRefs: sql`COALESCE(${vendors.externalRefs}, '{}'::jsonb) || ${JSON.stringify({ [SOURCE_SLUG]: m.cpp.cppId })}::jsonb`,
        updatedAt: new Date(),
      })
      .where(and(eq(vendors.id, m.vendorId!), eq(vendors.tenantId, tenantId)));
    updated++;
  }
  console.log(`\nStamped external_refs.${SOURCE_SLUG} on ${updated} vendor(s).`);
  await pool.end();
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
