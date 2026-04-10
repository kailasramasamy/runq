import { FastifyPluginAsync } from 'fastify';
import { commitInvoiceImportSchema, parseInvoicesQuerySchema, uuidParamSchema } from '@runq/validators';
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
  'image/jpeg',
  'image/png',
  'image/webp',
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
        if (!ALLOWED_MIMES.has(mimeType) && !/\.(xlsx|xls|csv|pdf|jpe?g|png|webp)$/i.test(part.filename)) {
          throw new AppError(
            400,
            `File '${part.filename}' has unsupported type '${mimeType}'. Allowed: xlsx, csv, pdf, jpg, png.`,
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
   */
  app.get(
    '/aliases',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { invoiceImportItemAliases, invoiceImportCustomerAliases, items, customers } = await import('@runq/db');
      const { eq } = await import('drizzle-orm');

      const itemAliases = await request.server.db
        .select({
          id: invoiceImportItemAliases.id,
          sourceName: invoiceImportItemAliases.sourceName,
          itemId: invoiceImportItemAliases.itemId,
          itemName: items.name,
          itemSku: items.sku,
          itemUnit: items.unit,
          createdAt: invoiceImportItemAliases.createdAt,
        })
        .from(invoiceImportItemAliases)
        .innerJoin(items, eq(invoiceImportItemAliases.itemId, items.id))
        .where(eq(invoiceImportItemAliases.tenantId, request.tenantId))
        .orderBy(invoiceImportItemAliases.sourceName);

      const customerAliases = await request.server.db
        .select({
          id: invoiceImportCustomerAliases.id,
          sourceKey: invoiceImportCustomerAliases.sourceKey,
          customerId: invoiceImportCustomerAliases.customerId,
          customerName: customers.name,
          createdAt: invoiceImportCustomerAliases.createdAt,
        })
        .from(invoiceImportCustomerAliases)
        .innerJoin(customers, eq(invoiceImportCustomerAliases.customerId, customers.id))
        .where(eq(invoiceImportCustomerAliases.tenantId, request.tenantId))
        .orderBy(invoiceImportCustomerAliases.sourceKey);

      return {
        data: {
          items: itemAliases.map((r) => ({
            id: r.id,
            sourceName: r.sourceName,
            itemId: r.itemId,
            itemName: r.itemName,
            itemSku: r.itemSku,
            itemUnit: r.itemUnit,
            createdAt: r.createdAt.toISOString(),
          })),
          customers: customerAliases.map((r) => ({
            id: r.id,
            sourceKey: r.sourceKey,
            customerId: r.customerId,
            customerName: r.customerName,
            createdAt: r.createdAt.toISOString(),
          })),
        },
      };
    },
  );

  /**
   * DELETE /aliases/items/:id  — remove a saved item mapping.
   * Used when a mapping was wrong and the user wants the next import
   * to re-prompt for this source name.
   */
  app.delete(
    '/aliases/items/:id',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { invoiceImportItemAliases } = await import('@runq/db');
      const { eq, and } = await import('drizzle-orm');
      const { id } = uuidParamSchema.parse(request.params);
      await request.server.db
        .delete(invoiceImportItemAliases)
        .where(
          and(
            eq(invoiceImportItemAliases.id, id),
            eq(invoiceImportItemAliases.tenantId, request.tenantId),
          ),
        );
      return reply.status(204).send();
    },
  );

  /**
   * DELETE /aliases/customers/:id  — remove a saved customer mapping.
   */
  app.delete(
    '/aliases/customers/:id',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { invoiceImportCustomerAliases } = await import('@runq/db');
      const { eq, and } = await import('drizzle-orm');
      const { id } = uuidParamSchema.parse(request.params);
      await request.server.db
        .delete(invoiceImportCustomerAliases)
        .where(
          and(
            eq(invoiceImportCustomerAliases.id, id),
            eq(invoiceImportCustomerAliases.tenantId, request.tenantId),
          ),
        );
      return reply.status(204).send();
    },
  );
};
