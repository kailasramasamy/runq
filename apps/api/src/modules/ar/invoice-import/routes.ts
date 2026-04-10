import { FastifyPluginAsync } from 'fastify';
import { commitInvoiceImportSchema, parseInvoicesQuerySchema } from '@runq/validators';
import { rbacHook } from '../../../hooks/rbac';
import { AppError } from '../../../utils/errors';
import { InvoiceImportService } from './import.service';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB per file

const ALLOWED_MIMES: ReadonlySet<string> = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'text/plain',
  'application/pdf',
  // Some browsers fall back to application/octet-stream for .xlsx — accept
  // and let the parser cascade decide whether the content is recognisable.
  'application/octet-stream',
]);

export const invoiceImportRoutes: FastifyPluginAsync = async (app) => {
  /**
   * POST /  — multipart upload of one or more invoice files.
   * Returns staged ParsedInvoice[] enriched with customer + item match
   * results. Stateless: the client round-trips this payload back to
   * /commit after the user has resolved any unmatched rows.
   *
   * Query: ?format=auto|generic-rows|single-invoice-template|heuristic|ai
   */
  app.post(
    '/',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { format } = parseInvoicesQuerySchema.parse(request.query);

      const buffers: { fileName: string; buffer: Buffer; mimeType: string }[] = [];
      const parts = request.files();
      for await (const part of parts) {
        const mimeType = (part.mimetype || '').toLowerCase();
        if (!ALLOWED_MIMES.has(mimeType) && !/\.(xlsx|xls|csv|pdf)$/i.test(part.filename)) {
          throw new AppError(
            400,
            `File '${part.filename}' has unsupported type '${mimeType}'. Allowed: xlsx, csv, pdf.`,
          );
        }
        const buf = await part.toBuffer();
        if (buf.length > MAX_FILE_SIZE) {
          throw new AppError(400, `File '${part.filename}' exceeds 10 MB limit`);
        }
        if (buf.length === 0) continue; // empty placeholder file — silently skip
        buffers.push({ fileName: part.filename, buffer: buf, mimeType });
      }

      if (buffers.length === 0) {
        throw new AppError(400, 'No files uploaded (or all files were empty)');
      }

      const service = new InvoiceImportService(request.server.db, request.tenantId);
      const result = await service.parseFiles(buffers, format);
      return { data: result };
    },
  );

  /**
   * POST /commit  — write the staged invoices to the DB.
   * Body: CommitInvoiceImportInput from the validators.
   * Returns CommitImportResult with created/skipped/error breakdown.
   */
  app.post(
    '/commit',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const input = commitInvoiceImportSchema.parse(request.body);
      const service = new InvoiceImportService(request.server.db, request.tenantId);
      const result = await service.commit(input, request.user?.userId);
      return { data: result };
    },
  );

  /**
   * GET /aliases  — list known item + customer aliases for the tenant.
   * Useful for the staging UI to show "this name maps to X (saved earlier)".
   */
  app.get(
    '/aliases',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async () => {
      // Phase 1: not exposed in the UI yet. Return empty stub so the
      // route exists for future iterations.
      return { data: { items: [], customers: [] } };
    },
  );
};
