#!/usr/bin/env tsx
/**
 * Inventory Module — Cross-surface parity check.
 *
 * Reads the manifest from apps/api/src/modules/inventory/manifest.ts and
 * asserts:
 *   1. Every API endpoint appears in apps/api/src/modules/inventory/routes.ts
 *   2. Every web route file exists at apps/web/src/routes/inventory/<file>
 *   3. Every mobile screen file exists at apps/mobile/lib/screens/inventory/<file>
 *
 * We can't simply `import` the manifest from a sibling package under web's
 * ESM tsx runner (Node would need a transpile pipeline that crosses package
 * boundaries). Instead we extract the file lists by parsing the manifest as
 * text — small surface, cheap to keep correct, and avoids cross-package
 * module-resolution headaches.
 *
 * Run: pnpm --filter @runq/web check:inventory-parity
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');

const WEB_ROUTES_DIR = resolve(repoRoot, 'apps/web/src/routes/inventory');
const MOBILE_SCREENS_DIR = resolve(repoRoot, 'apps/mobile/lib/screens/inventory');
const API_ROUTES_FILE = resolve(repoRoot, 'apps/api/src/modules/inventory/routes.ts');
const MANIFEST_FILE = resolve(repoRoot, 'apps/api/src/modules/inventory/manifest.ts');

if (!existsSync(MANIFEST_FILE)) {
  console.error(`❌ manifest missing: ${MANIFEST_FILE}`);
  process.exit(1);
}

const manifestText = readFileSync(MANIFEST_FILE, 'utf8');

// Extract every capability block. Each block begins with `key: '...'` and
// ends at the closing brace. We just regex out the three arrays we care
// about per block; close enough for a single-file authored manifest.
type Capability = {
  key: string;
  apiPaths: string[];
  webFiles: string[];
  mobileFiles: string[];
};

const blocks = manifestText.split(/^\s*\{\s*$/m).slice(1);
const capabilities: Capability[] = [];
for (const raw of blocks) {
  const keyMatch = raw.match(/key:\s*'([^']+)'/);
  if (!keyMatch) continue;
  const key = keyMatch[1]!;
  // API entries: { method: 'GET', path: '/foo' }
  const apiPaths = [...raw.matchAll(/path:\s*'([^']+)'/g)].map((m) => m[1]!);
  const webFiles = extractArray(raw, 'webFiles');
  const mobileFiles = extractArray(raw, 'mobileFiles');
  capabilities.push({ key, apiPaths, webFiles, mobileFiles });
}

function extractArray(block: string, name: string): string[] {
  const re = new RegExp(`${name}:\\s*\\[([^\\]]*)\\]`, 's');
  const m = block.match(re);
  if (!m) return [];
  return [...m[1]!.matchAll(/'([^']+)'/g)].map((x) => x[1]!);
}

const failures: string[] = [];

if (!existsSync(API_ROUTES_FILE)) {
  failures.push(`MISSING api routes file: ${API_ROUTES_FILE}`);
}
const routesSource = existsSync(API_ROUTES_FILE) ? readFileSync(API_ROUTES_FILE, 'utf8') : '';

for (const cap of capabilities) {
  for (const w of cap.webFiles) {
    const full = resolve(WEB_ROUTES_DIR, w);
    if (!existsSync(full)) {
      failures.push(`[${cap.key}] MISSING web file: apps/web/src/routes/inventory/${w}`);
    }
  }
  for (const m of cap.mobileFiles) {
    const full = resolve(MOBILE_SCREENS_DIR, m);
    if (!existsSync(full)) {
      failures.push(`[${cap.key}] MISSING mobile file: apps/mobile/lib/screens/inventory/${m}`);
    }
  }
  for (const p of cap.apiPaths) {
    const stem = p.replace(/:[a-zA-Z]+/g, '').split('/').filter(Boolean)[0] ?? '';
    if (stem && !routesSource.includes(stem)) {
      failures.push(`[${cap.key}] API path stem missing in routes.ts: ${p}`);
    }
  }
}

if (failures.length === 0) {
  const counts = capabilities.reduce(
    (acc, c) => {
      acc.api += c.apiPaths.length;
      acc.web += c.webFiles.length;
      acc.mobile += c.mobileFiles.length;
      return acc;
    },
    { api: 0, web: 0, mobile: 0 },
  );
  console.log(
    `✅ inventory parity: ${capabilities.length} capabilities — ` +
      `${counts.api} api / ${counts.web} web / ${counts.mobile} mobile artefacts.`,
  );
  process.exit(0);
}

console.error(`❌ inventory parity check failed (${failures.length}):\n`);
for (const f of failures) console.error('  ' + f);
process.exit(1);
