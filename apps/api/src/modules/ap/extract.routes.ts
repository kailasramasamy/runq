import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { rbacHook } from '../../hooks/rbac';
import { ExtractService } from './extract.service';
import { ScanImportService } from './scan-import.service';

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
      return { data: result };
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
      const result = await service.scanAndImport(buffer, mimeType, file.filename);
      return reply.status(201).send({ data: result });
    },
  );

  // Commit a previously extracted invoice (from preview)
  const commitSchema = z.object({
    extracted: z.object({
      vendorName: z.string().min(1),
      vendorGstin: z.string().nullable().default(null),
      invoiceNumber: z.string().min(1),
      invoiceDate: z.string(),
      dueDate: z.string().nullable().default(null),
      items: z.array(z.object({
        itemName: z.string().min(1),
        hsnSacCode: z.string().nullable().default(null),
        quantity: z.number().positive(),
        unitPrice: z.number().nonnegative(),
        amount: z.number().positive(),
        taxRate: z.number().nullable().default(null),
        taxCategory: z.string().nullable().default(null),
      })).min(1),
      subtotal: z.number().nonnegative(),
      taxAmount: z.number().nonnegative(),
      totalAmount: z.number().positive(),
      tdsSection: z.string().nullable().default(null),
      confidence: z.number(),
    }),
    vendorId: z.string().uuid().nullish(),
  });

  app.post(
    '/scan-commit',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { extracted, vendorId } = commitSchema.parse(request.body);
      const service = new ScanImportService(request.server.db, request.tenantId);
      const result = await service.commitExtracted(extracted, vendorId ?? undefined);
      return reply.status(201).send({ data: result });
    },
  );
};
