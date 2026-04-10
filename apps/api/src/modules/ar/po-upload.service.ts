import { createHash, randomUUID } from 'node:crypto';
import { eq, and, notInArray } from 'drizzle-orm';
import { poUploads, poDrafts } from '@runq/db';
import type { Db } from '@runq/db';
import type { StorageProvider } from '../../utils/storage';
import { NotFoundError, ConflictError } from '../../utils/errors';
import { PoParserService } from './po-parser.service';

// Statuses that DO NOT count as a "live" duplicate. A discarded or rejected
// upload is intentionally hidden from the workflow, so re-uploading the same
// content is fine.
type PoUploadStatus = PoUploadRow['status'];
const ACTIVE_STATUSES_FOR_DEDUP: PoUploadStatus[] = [
  'pending',
  'parsing',
  'parsed',
  'parse_error',
];

type PoUploadRow = typeof poUploads.$inferSelect;
type PoSourceChannel = PoUploadRow['source'];

interface CreateFromFileParams {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  source: PoSourceChannel;
  sourceMetadata?: Record<string, unknown> | null;
  uploadedBy?: string | null;
}

interface CreateFromTextParams {
  text: string;
  source: PoSourceChannel;
  sourceMetadata?: Record<string, unknown> | null;
  uploadedBy?: string | null;
}

/**
 * Writes incoming PO uploads (files or pasted text) to storage and the
 * po_uploads table. The parser worker (Phase 2) flips status from 'pending'
 * → 'parsing' → 'parsed' / 'parse_error' and creates the corresponding
 * po_drafts row.
 *
 * Tenant isolation is enforced both by RLS (via tenantId on every row) and
 * application-side WHERE clauses, matching the pattern of every other
 * runq service.
 */
export class PoUploadService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
    private readonly storage: StorageProvider,
  ) {}

  async createFromFile(params: CreateFromFileParams): Promise<PoUploadRow> {
    if (params.buffer.length === 0) {
      throw new ConflictError('Uploaded file is empty');
    }

    const fileHash = createHash('sha256').update(params.buffer).digest('hex');
    await this.assertNotDuplicate(fileHash);

    // Reserve the id so the storage key includes it (matches AttachmentService convention).
    const id = randomUUID();

    const storageKey = await this.storage.upload({
      tenantId: this.tenantId,
      entityType: 'po_upload',
      entityId: id,
      fileName: params.fileName,
      mimeType: params.mimeType,
      data: params.buffer,
    });

    const [row] = await this.db
      .insert(poUploads)
      .values({
        id,
        tenantId: this.tenantId,
        uploadedBy: params.uploadedBy ?? null,
        source: params.source,
        sourceMetadata: params.sourceMetadata ?? null,
        storageKey,
        fileName: params.fileName,
        fileSize: params.buffer.length,
        fileMime: params.mimeType,
        fileHash,
        status: 'pending',
      })
      .returning();

    this.triggerParseInBackground(row!.id);
    return row!;
  }

  async createFromText(params: CreateFromTextParams): Promise<PoUploadRow> {
    const trimmed = params.text.trim();
    if (!trimmed) {
      throw new ConflictError('Cannot create a PO from empty text');
    }

    const fileHash = createHash('sha256').update(trimmed).digest('hex');
    await this.assertNotDuplicate(fileHash);

    const [row] = await this.db
      .insert(poUploads)
      .values({
        tenantId: this.tenantId,
        uploadedBy: params.uploadedBy ?? null,
        source: params.source,
        sourceMetadata: params.sourceMetadata ?? null,
        rawText: trimmed,
        fileHash,
        status: 'pending',
      })
      .returning();

    this.triggerParseInBackground(row!.id);
    return row!;
  }

  /**
   * Re-runs the parser on an existing upload (used by the reparse endpoint
   * after a parse_error or after a low-confidence first attempt).
   */
  async reparse(uploadId: string): Promise<PoUploadRow> {
    const existing = await this.getById(uploadId); // tenant-scoped, throws if missing
    const parser = new PoParserService(this.db, this.tenantId, this.storage);
    await parser.resetForReparse(existing.id);
    this.triggerParseInBackground(existing.id);
    return this.getById(existing.id);
  }

  /**
   * Soft-delete a PO upload: sets status to 'discarded', drops the draft
   * + lines, and deletes the S3 file. The po_uploads row stays for audit
   * but the duplicate-hash check skips 'discarded' rows, so re-uploading
   * the same file is allowed.
   */
  async discard(uploadId: string): Promise<void> {
    const upload = await this.getById(uploadId);

    await this.db.transaction(async (tx) => {
      // Drop the draft (lines cascade via FK)
      await tx
        .delete(poDrafts)
        .where(and(eq(poDrafts.poUploadId, uploadId), eq(poDrafts.tenantId, this.tenantId)));

      // Mark the upload as discarded
      await tx
        .update(poUploads)
        .set({ status: 'discarded', updatedAt: new Date() })
        .where(and(eq(poUploads.id, uploadId), eq(poUploads.tenantId, this.tenantId)));
    });

    // Delete the file from S3 (best-effort, don't fail the request if S3 is slow)
    if (upload.storageKey) {
      this.storage.delete(upload.storageKey).catch((err) => {
        console.warn(`[po-upload] Failed to delete S3 file ${upload.storageKey}:`, err);
      });
    }
  }

  async getById(id: string): Promise<PoUploadRow> {
    const [row] = await this.db
      .select()
      .from(poUploads)
      .where(and(eq(poUploads.id, id), eq(poUploads.tenantId, this.tenantId)))
      .limit(1);

    if (!row) throw new NotFoundError('PoUpload');
    return row;
  }

  /**
   * Stream the source file for the review screen's inline preview. Returns
   * the storage stream + metadata so the route can set Content-Type +
   * Content-Disposition headers. Throws NotFoundError if the upload has
   * no file (text-only paste).
   */
  async getFileStream(id: string): Promise<{
    stream: import('node:stream').Readable;
    mimeType: string;
    fileName: string;
    fileSize: number | null;
  }> {
    const upload = await this.getById(id);
    if (!upload.storageKey || !upload.fileMime) {
      throw new NotFoundError('PoUpload file');
    }
    const stream = await this.storage.getStream(upload.storageKey);
    return {
      stream,
      mimeType: upload.fileMime,
      fileName: upload.fileName ?? 'po-source',
      fileSize: upload.fileSize,
    };
  }

  /**
   * Reject uploads whose SHA-256 already matches a live row for this tenant.
   * Discarded/rejected/approved uploads do NOT count — re-uploading after
   * rejection is intentional. Throws a 409 with the existing upload id in
   * the structured `details` payload so the frontend can render an
   * "Open existing" link.
   */
  private async assertNotDuplicate(fileHash: string): Promise<void> {
    const [existing] = await this.db
      .select({ id: poUploads.id, status: poUploads.status, fileName: poUploads.fileName })
      .from(poUploads)
      .where(
        and(
          eq(poUploads.tenantId, this.tenantId),
          eq(poUploads.fileHash, fileHash),
          // Approved drafts should also block — re-uploading the same content
          // would create a parallel invoice for the same PO. Use the
          // ACTIVE_STATUSES allow-list, which excludes 'discarded' only.
          notInArray(poUploads.status, ['discarded'] as PoUploadStatus[]),
        ),
      )
      .limit(1);

    if (existing) {
      throw new ConflictError(
        `This PO has already been uploaded${existing.fileName ? ` (${existing.fileName})` : ''}`,
        { duplicateOfUploadId: existing.id, status: existing.status },
      );
    }
  }

  /**
   * Fire-and-forget background parse. setImmediate yields the event loop so
   * the HTTP response goes out before the parser starts hitting Claude. The
   * parser swallows its own errors into po_uploads.error_message, so the
   * .catch() here is a paranoid backstop for unexpected sync throws.
   */
  private triggerParseInBackground(uploadId: string): void {
    setImmediate(() => {
      const parser = new PoParserService(this.db, this.tenantId, this.storage);
      parser.parse(uploadId).catch((err) => {
        // eslint-disable-next-line no-console
        console.error(`[po-parser] background parse failed for ${uploadId}:`, err);
      });
    });
  }
}
