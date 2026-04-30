import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { rbacHook } from '../../hooks/rbac';
import { ExtractService } from './extract.service';
import { ScanImportService } from './scan-import.service';
import { AttachmentService } from '../common/attachment.service';
import { getStorageProvider } from '../../utils/storage';
import { ExtractionStagingService } from './extraction-staging.service';
import { documentAttachments } from '@runq/db';

const WRITE_ROLES = ['owner', 'accountant'] as const;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIMES: Record<string, boolean> = {
  'application/pdf': true,
  'image/png': true,
  'image/jpeg': true,
  'image/jpg': true,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': true,
  'text/csv': true,
};

function resolveMime(mimetype: string, filename: string): string {
  const mime = mimetype.toLowerCase();
  if (ALLOWED_MIMES[mime]) return mime;
  const ext = filename.split('.').pop()?.toLowerCase();
  const extMap: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', csv: 'text/csv', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
  return extMap[ext ?? ''] ?? mime;
}

export const extractRoutes: FastifyPluginAsync = async (app) => {
  // Extract data from a file (preview only, no DB writes)
  app.post(
    '/extract',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const file = await request.file();
      if (!file) return reply.status(400).send({ error: 'No file uploaded' });

      const mimeType = resolveMime(file.mimetype, file.filename);
      if (!ALLOWED_MIMES[mimeType]) {
        return reply.status(400).send({ error: 'Unsupported file type. Upload PDF, PNG, JPG, CSV, or XLSX.' });
      }

      const buffer = await file.toBuffer();
      if (buffer.length > MAX_FILE_SIZE) {
        return reply.status(400).send({ error: 'File too large. Maximum size is 10 MB.' });
      }

      const service = new ExtractService(request.server.db, request.tenantId);
      const result = await service.extractFromFile(buffer, mimeType, file.filename);

      // Stage the file in S3 + Redis so /scan-commit can bind it to the
      // bill without re-uploading. TTL 30 minutes; orphans are eligible
      // for S3 lifecycle cleanup under the `_extraction_tmp/` prefix.
      const staging = new ExtractionStagingService(request.server.redis, getStorageProvider());
      const { extractionId } = await staging.stage({
        tenantId: request.tenantId,
        fileName: file.filename,
        mimeType,
        data: buffer,
      });

      return { data: { ...result, extractionId } };
    },
  );

  // Scan + import: extract from file, auto-create vendor if needed, create bill
  app.post(
    '/scan-import',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const file = await request.file();
      if (!file) return reply.status(400).send({ error: 'No file uploaded' });

      const mimeType = resolveMime(file.mimetype, file.filename);
      if (!ALLOWED_MIMES[mimeType]) {
        return reply.status(400).send({ error: 'Unsupported file type. Upload PDF, PNG, JPG, CSV, or XLSX.' });
      }

      const buffer = await file.toBuffer();
      if (buffer.length > MAX_FILE_SIZE) {
        return reply.status(400).send({ error: 'File too large. Maximum size is 10 MB.' });
      }

      const service = new ScanImportService(request.server.db, request.tenantId);
      const result = await service.scanAndImport(buffer, mimeType, file.filename, request.user.userId);

      // Auto-attach the scanned invoice file to the created bill
      const attachmentService = new AttachmentService(request.server.db, request.tenantId, getStorageProvider());
      await attachmentService.upload({
        entityType: 'purchase_invoice',
        entityId: result.billId,
        fileName: file.filename,
        fileSize: buffer.length,
        mimeType,
        data: buffer,
        uploadedBy: request.user.userId,
      });

      return reply.status(201).send({ data: result });
    },
  );

  // Commit a previously extracted invoice (from preview).
  // The client should round-trip the original `aiOutput` from /extract so we
  // can record the user's correction diff for downstream learning.
  // `null` for numeric amount fields means "not present on the bill" — tax-
  // inclusive bills (fuel, retail receipts) legitimately have no separate
  // tax line. We coerce null → 0 at validation.
  const nonNegOrNull = z.preprocess((v) => v ?? 0, z.number().nonnegative());
  const extractedSchema = z.object({
    vendorName: z.string().min(1),
    vendorGstin: z.string().nullable().default(null),
    vendorPan: z.string().nullable().default(null),
    vendorPhone: z.string().nullable().default(null),
    vendorEmail: z.string().nullable().default(null),
    vendorAddress: z.string().nullable().default(null),
    vendorCity: z.string().nullable().default(null),
    vendorState: z.string().nullable().default(null),
    vendorPincode: z.string().nullable().default(null),
    vendorBankAccount: z.string().nullable().default(null),
    vendorBankIfsc: z.string().nullable().default(null),
    vendorBankName: z.string().nullable().default(null),
    invoiceNumber: z.string().min(1),
    invoiceDate: z.string(),
    dueDate: z.string().nullable().default(null),
    items: z.array(z.object({
      itemName: z.string().min(1),
      hsnSacCode: z.string().nullable().default(null),
      quantity: z.number().positive(),
      // Discount / round-off lines have a negative unitPrice; null means
      // "not separately printed" (the AI dropped it).
      unitPrice: z.preprocess((v) => v ?? 0, z.number()),
      // Negative amounts are valid for discount lines / credit adjustments;
      // only zero is meaningless on a bill line.
      amount: z.number().refine((n) => n !== 0, { message: 'amount cannot be zero' }),
      taxRate: z.number().nullable().default(null),
      taxCategory: z.string().nullable().default(null),
    })).min(1),
    subtotal: nonNegOrNull,
    taxAmount: nonNegOrNull,
    totalAmount: z.number().positive(),
    tdsSection: z.string().nullable().default(null),
    confidence: z.number(),
  });

  const commitSchema = z.object({
    extracted: extractedSchema,
    vendorId: z.string().uuid().nullish(),
    // Optional — when present, used to compute the user's correction diff.
    // The client should pass the `extracted` field from the original
    // /extract response untouched.
    // Reference data for diff logging only — never persisted as the bill.
    // Validating it strictly defeats the purpose, since the AI's raw output
    // is precisely what we want to record warts and all.
    aiOutput: z.record(z.unknown()).nullish(),
    // Optional — present when the bill came through the two-step
    // extract → review → commit flow. Used to bind the already-uploaded
    // S3 file as an attachment on the new bill.
    extractionId: z.string().uuid().nullish(),
  });

  app.post(
    '/scan-commit',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { extracted, vendorId, aiOutput, extractionId } = commitSchema.parse(request.body);
      const service = new ScanImportService(request.server.db, request.tenantId);
      // Synthesize an ExtractionResult shape so commitExtracted records the
      // user diff against the AI output (when the client passed it).
      const fakeExtraction = aiOutput
        ? {
            confidence: typeof aiOutput.confidence === 'number' ? aiOutput.confidence : extracted.confidence,
            extracted: aiOutput as unknown as typeof extracted,
            vendorMatch: null,
          }
        : undefined;
      const result = await service.commitExtracted(extracted, vendorId ?? undefined, fakeExtraction, request.user.userId);

      // Bind the staged S3 file (if any) to the new bill as an attachment.
      // We don't move the object in S3 — just create a row pointing to the
      // existing key. Best-effort; never blocks the bill commit.
      if (extractionId) {
        try {
          const staging = new ExtractionStagingService(request.server.redis, getStorageProvider());
          const staged = await staging.claim(extractionId, request.tenantId);
          if (staged) {
            await request.server.db.insert(documentAttachments).values({
              tenantId: request.tenantId,
              entityType: 'purchase_invoice',
              entityId: result.billId,
              fileName: staged.fileName,
              fileSize: staged.fileSize,
              mimeType: staged.mimeType,
              storageKey: staged.storageKey,
              uploadedBy: request.user.userId,
            });
          }
        } catch (err) {
          request.server.log.warn({ err, extractionId }, 'Failed to bind extraction to bill');
        }
      }

      return reply.status(201).send({ data: result });
    },
  );
};
