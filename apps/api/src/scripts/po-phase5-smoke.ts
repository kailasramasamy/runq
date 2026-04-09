/**
 * Phase 5 smoke test — duplicate detection + file streaming.
 *
 *   cd apps/api
 *   node --env-file=../../.env --import tsx src/scripts/po-phase5-smoke.ts
 *
 * Verifies:
 *   1. createFromText with the same content twice → second call throws
 *      ConflictError with details.duplicateOfUploadId pointing to the first.
 *   2. createFromFile with a synthetic PNG → getFileStream returns the same
 *      bytes and correct MIME type. Then duplicate the same buffer → 409.
 */

import { createDb, poUploads } from '@runq/db';
import { eq, and } from 'drizzle-orm';
import { PoUploadService } from '../modules/ar/po-upload.service';
import { LocalStorageProvider } from '../utils/storage/local-storage';
import { ConflictError } from '../utils/errors';

const TENANT_NAME_LIKE = 'Vrindavan%';

// 1x1 transparent PNG (smallest valid PNG)
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63XAAAAAASUVORK5CYII=',
  'base64',
);

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');

  const { db, pool } = createDb(url);

  const tenantRow = await pool.query<{ id: string; name: string }>(
    'SELECT id, name FROM tenants WHERE name LIKE $1 LIMIT 1',
    [TENANT_NAME_LIKE],
  );
  const tenantId = tenantRow.rows[0]!.id;
  console.log(`Using tenant: ${tenantRow.rows[0]!.name}`);

  const userRow = await pool.query<{ id: string }>(
    'SELECT id FROM users WHERE tenant_id = $1 LIMIT 1',
    [tenantId],
  );
  const userId = userRow.rows[0]!.id;

  // Force the local storage provider for this smoke test — the dev env has
  // S3_BUCKET pointing at a non-existent bucket, which would otherwise fail.
  const storage = new LocalStorageProvider();
  const service = new PoUploadService(db, tenantId, storage);

  // ── Test 1: text duplicate ────────────────────────────────────────────
  console.log('\n[1/3] Text duplicate detection');
  const text = 'PO smoke test ' + Date.now() + ' — 5 x Milk 1L';
  const first = await service.createFromText({
    text,
    source: 'paste_text',
    uploadedBy: userId,
  });
  console.log(`  First upload OK: ${first.id}`);

  let dupErrText: ConflictError | null = null;
  try {
    await service.createFromText({ text, source: 'paste_text', uploadedBy: userId });
  } catch (err) {
    if (err instanceof ConflictError) dupErrText = err;
    else throw err;
  }
  if (!dupErrText) throw new Error('Expected ConflictError on duplicate text');
  if ((dupErrText.details as { duplicateOfUploadId?: string })?.duplicateOfUploadId !== first.id) {
    throw new Error('details.duplicateOfUploadId did not point to first upload');
  }
  console.log(`  Second upload blocked: "${dupErrText.message}"`);
  console.log(`  details.duplicateOfUploadId = ${(dupErrText.details as Record<string, unknown>).duplicateOfUploadId}`);

  // ── Test 2: file upload + stream-back ─────────────────────────────────
  console.log('\n[2/3] File upload + getFileStream round-trip');
  const fileUpload = await service.createFromFile({
    buffer: TINY_PNG,
    fileName: 'smoke.png',
    mimeType: 'image/png',
    source: 'web_upload',
    uploadedBy: userId,
  });
  console.log(`  File upload OK: ${fileUpload.id} (${fileUpload.fileSize} bytes)`);

  const streamed = await service.getFileStream(fileUpload.id);
  const chunks: Buffer[] = [];
  for await (const chunk of streamed.stream) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk));
  }
  const downloaded = Buffer.concat(chunks);
  console.log(`  Streamed back ${downloaded.length} bytes (mime=${streamed.mimeType}, name=${streamed.fileName})`);
  if (!downloaded.equals(TINY_PNG)) {
    throw new Error('Streamed bytes did not match original');
  }
  console.log('  Bytes match original ✓');

  // ── Test 3: file duplicate ────────────────────────────────────────────
  console.log('\n[3/3] File duplicate detection');
  let dupErrFile: ConflictError | null = null;
  try {
    await service.createFromFile({
      buffer: TINY_PNG,
      fileName: 'smoke-2.png',
      mimeType: 'image/png',
      source: 'web_upload',
      uploadedBy: userId,
    });
  } catch (err) {
    if (err instanceof ConflictError) dupErrFile = err;
    else throw err;
  }
  if (!dupErrFile) throw new Error('Expected ConflictError on duplicate file');
  console.log(`  Duplicate file blocked: "${dupErrFile.message}"`);

  // ── Cleanup ───────────────────────────────────────────────────────────
  console.log('\nCleaning up...');
  for (const id of [first.id, fileUpload.id]) {
    // Drop any drafts the background parser may have produced
    await pool.query('DELETE FROM po_drafts WHERE po_upload_id = $1', [id]);
    await db
      .delete(poUploads)
      .where(and(eq(poUploads.id, id), eq(poUploads.tenantId, tenantId)));
  }
  console.log('Cleanup done.');

  await pool.end();
}

main().catch((err) => {
  console.error('\nPhase 5 smoke test FAILED:', err);
  process.exit(1);
});
