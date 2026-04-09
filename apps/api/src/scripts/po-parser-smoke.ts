/**
 * Phase 2 smoke test — exercises the real parser against the dev DB and
 * Claude. Run with:
 *   cd apps/api
 *   node --env-file=../../.env --import tsx src/scripts/po-parser-smoke.ts
 *
 * This script is intentionally a one-off — feel free to delete after Phase 2
 * is verified, or keep it as a CLI smoke harness.
 */

import { eq, and } from 'drizzle-orm';
import { createDb, poUploads, poDrafts, poDraftLines } from '@runq/db';
import { PoParserService } from '../modules/ar/po-parser.service';
import { getStorageProvider } from '../utils/storage';

const SAMPLE_TEXT_PO = `[09/04/26, 8:23 AM] Sharma Foods: PO for tomorrow morning delivery
- 50 x Full Cream Milk 1L Pouch
- 25 kg Paneer Block
- 80 x Curd 500g Cup
- 20 x Ghee 500ml Jar
Delivery 7am
Thanks!`;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');

  const { db, pool } = createDb(url);

  // 1. Find a tenant to use
  const tenantRows = await pool.query<{ id: string; name: string }>(
    'SELECT id, name FROM tenants LIMIT 1',
  );
  if (tenantRows.rows.length === 0) {
    console.error('No tenants in DB');
    process.exit(1);
  }
  const tenantId = tenantRows.rows[0]!.id;
  console.log(`Using tenant: ${tenantRows.rows[0]!.name} (${tenantId})`);

  // 2. Insert a paste-text upload row directly
  const ins = await pool.query<{ id: string }>(
    `INSERT INTO po_uploads (tenant_id, source, raw_text, file_hash, status)
     VALUES ($1, 'paste_text', $2, $3, 'pending')
     RETURNING id`,
    [tenantId, SAMPLE_TEXT_PO, `smoke-${Date.now()}`],
  );
  const uploadId = ins.rows[0]!.id;
  console.log(`\nCreated po_uploads row: ${uploadId}`);

  // 3. Run the parser synchronously
  console.log('\nRunning parser...');
  const t0 = Date.now();
  const parser = new PoParserService(db, tenantId, getStorageProvider());
  await parser.parse(uploadId);
  console.log(`Parser finished in ${Date.now() - t0}ms`);

  // 4. Read back the upload + draft + lines
  const upload = await db
    .select()
    .from(poUploads)
    .where(and(eq(poUploads.id, uploadId), eq(poUploads.tenantId, tenantId)))
    .limit(1);

  console.log('\n── po_uploads ───────────────────────────────');
  console.log({
    id: upload[0]?.id,
    status: upload[0]?.status,
    parsedAt: upload[0]?.parsedAt,
    errorMessage: upload[0]?.errorMessage,
  });

  const draft = await db
    .select()
    .from(poDrafts)
    .where(and(eq(poDrafts.poUploadId, uploadId), eq(poDrafts.tenantId, tenantId)))
    .limit(1);

  if (draft.length === 0) {
    console.log('\nNo draft created (expected only if parse failed).');
  } else {
    console.log('\n── po_drafts ────────────────────────────────');
    console.log({
      id: draft[0]?.id,
      reviewStatus: draft[0]?.reviewStatus,
      customerId: draft[0]?.customerId,
      customerMatchSource: draft[0]?.customerMatchSource,
      customerMatchConfidence: draft[0]?.customerMatchConfidence,
      buyerNameRaw: draft[0]?.buyerNameRaw,
      buyerGstinRaw: draft[0]?.buyerGstinRaw,
      poNumberExtracted: draft[0]?.poNumberExtracted,
      poDate: draft[0]?.poDate,
      deliveryDate: draft[0]?.deliveryDate,
      grandTotal: draft[0]?.grandTotal,
      reviewFlags: draft[0]?.reviewFlags,
      llmModel: draft[0]?.llmModel,
    });

    const lines = await db
      .select()
      .from(poDraftLines)
      .where(
        and(eq(poDraftLines.poDraftId, draft[0]!.id), eq(poDraftLines.tenantId, tenantId)),
      );

    console.log(`\n── po_draft_lines (${lines.length}) ────────────────`);
    for (const l of lines) {
      console.log({
        i: l.lineIndex,
        rawDescription: l.rawDescription,
        rawQty: l.rawQty,
        rawUom: l.rawUom,
        matchedItemId: l.matchedItemId,
        matchSource: l.matchSource,
        resolvedRate: l.resolvedRate,
        amount: l.amount,
        flag: l.reviewFlag,
      });
    }
  }

  // 5. Cleanup
  await pool.query('DELETE FROM po_uploads WHERE id = $1', [uploadId]);
  console.log('\nCleaned up.');
  await pool.end();
}

main().catch((err) => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});
