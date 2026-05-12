import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { rbacHook } from '../../hooks/rbac';
import { AppError } from '../../utils/errors';
import { StatementImportService } from './statement-import.service';

const WRITE_ROLES = ['owner', 'accountant'] as const;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIMES: ReadonlySet<string> = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'text/plain',
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/octet-stream',
]);

const commitBodySchema = z.object({
  accountId: z.string().uuid(),
  transactions: z.array(z.object({
    transactionDate: z.string(),
    valueDate: z.string().nullable().optional(),
    type: z.enum(['credit', 'debit']),
    amount: z.number().positive(),
    reference: z.string().nullable(),
    narration: z.string().nullable(),
    runningBalance: z.number().nullable(),
  })),
});

export const statementImportRoutes: FastifyPluginAsync = async (app) => {
  /**
   * POST /parse — multipart upload of bank statement files.
   * Returns parsed transactions + detected bank account per file,
   * plus all tenant bank accounts with their last sync dates.
   */
  app.post(
    '/parse',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const buffers: { fileName: string; buffer: Buffer; mimeType: string }[] = [];
      const parts = request.files();
      for await (const part of parts) {
        const mimeType = (part.mimetype || '').toLowerCase();
        if (
          !ALLOWED_MIMES.has(mimeType) &&
          !/\.(xlsx|xls|csv|pdf|jpe?g|png|webp)$/i.test(part.filename)
        ) {
          throw new AppError(
            400,
            `File '${part.filename}' has unsupported type '${mimeType}'. Allowed: xlsx, csv, pdf, jpg, png.`,
          );
        }
        const buf = await part.toBuffer();
        if (buf.length > MAX_FILE_SIZE) {
          throw new AppError(400, `File '${part.filename}' exceeds 10 MB limit`);
        }
        if (buf.length === 0) continue;
        buffers.push({ fileName: part.filename, buffer: buf, mimeType });
      }

      if (buffers.length === 0) {
        throw new AppError(400, 'No files uploaded (or all files were empty)');
      }

      const service = new StatementImportService(request.server.db, request.tenantId);
      const result = await service.parseFiles(buffers);
      return { data: result };
    },
  );

  /**
   * POST /analyze — dry-run dedup check. Returns which rows are duplicates of
   * existing transactions without inserting anything. The UI calls this before
   * commit so the user can see duplicate counts and confirm before proceeding.
   */
  app.post(
    '/analyze',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { accountId, transactions } = commitBodySchema.parse(request.body);
      const service = new StatementImportService(request.server.db, request.tenantId);
      const result = await service.analyzeImport(accountId, transactions);
      return reply.status(200).send({ data: result });
    },
  );

  /**
   * POST /commit — import parsed transactions into a bank account.
   * Handles dedup: transactions that already exist are skipped.
   */
  app.post(
    '/commit',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { accountId, transactions } = commitBodySchema.parse(request.body);
      const service = new StatementImportService(request.server.db, request.tenantId);
      const result = await service.commitImport(accountId, transactions);
      return reply.status(200).send({ data: result });
    },
  );
};
