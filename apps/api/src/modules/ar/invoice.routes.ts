import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { tenants } from '@runq/db';
import { WebhookEndpointService } from '../webhooks/webhook-endpoint.service';
import {
  createSalesInvoiceSchema,
  updateSalesInvoiceSchema,
  salesInvoiceFilterSchema,
  sendInvoiceSchema,
  markPaidSchema,
  paginationSchema,
  uuidParamSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { InvoiceService } from './invoice.service';
import { GLService } from '../gl/gl.service';
import { generateUPILink } from '../../utils/upi/upi-link';
import { InterestService } from './interest.service';
import { NotFoundError } from '../../utils/errors';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;
const OWNER_ROLES = ['owner'] as const;

export const invoiceRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/summary',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const filters = salesInvoiceFilterSchema.parse(request.query);
      const service = new InvoiceService(request.server.db, request.tenantId);
      const summary = await service.summary(filters);
      return { data: summary };
    },
  );

  app.get(
    '/',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const pagination = paginationSchema.parse(request.query);
      const filters = salesInvoiceFilterSchema.parse(request.query);
      const service = new InvoiceService(request.server.db, request.tenantId);
      return service.list({ page: pagination.page, limit: pagination.limit, filters });
    },
  );

  app.get(
    '/:id',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new InvoiceService(request.server.db, request.tenantId);
      const invoice = await service.getById(id);
      return { data: invoice };
    },
  );

  app.post(
    '/',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const input = createSalesInvoiceSchema.parse(request.body);
      const service = new InvoiceService(request.server.db, request.tenantId);
      const invoice = await service.create(input);

      // Drafts don't hit the GL — revenue is recognised on send (POST /:id/send
      // / batch-status → sent). This lets users edit / delete a draft freely
      // without GL reversals, mirroring the AP draft → approve flow.

      const webhooks = new WebhookEndpointService(request.server.db, request.tenantId);
      void webhooks.deliver('invoice.created', {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        customerName: invoice.customerName,
        totalAmount: invoice.totalAmount,
        invoiceDate: invoice.invoiceDate,
      });

      return reply.status(201).send({ data: invoice });
    },
  );

  app.put(
    '/:id',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = updateSalesInvoiceSchema.parse(request.body);
      const service = new InvoiceService(request.server.db, request.tenantId);
      const invoice = await service.update(id, input);
      return { data: invoice };
    },
  );

  // HSN/SAC classification fix — allowed on issued invoices (sent/paid/etc).
  // See InvoiceService.updateLineHsn for rationale (HSN is tax metadata, not
  // a financial figure).
  app.patch(
    '/:id/hsn',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const body = z.object({
        items: z.array(z.object({
          id: z.string().uuid(),
          hsnSacCode: z.string().min(2).max(8),
        })).min(1),
      }).parse(request.body);
      const service = new InvoiceService(request.server.db, request.tenantId);
      const invoice = await service.updateLineHsn(id, body.items, request.user?.userId);
      return { data: invoice };
    },
  );

  app.delete(
    '/:id',
    { preHandler: [rbacHook([...OWNER_ROLES])] },
    async (request, reply) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new InvoiceService(request.server.db, request.tenantId);
      await service.cancel(id);
      return reply.status(204).send();
    },
  );

  // Void a sent/paid/overdue invoice — issues an auto-CN mirroring the
  // invoice's line items + tax, then sets status='cancelled'. Lands in
  // the next GSTR-1 as a CDN reversal of the original. Owner-only.
  app.post(
    '/:id/void',
    { preHandler: [rbacHook([...OWNER_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const body = z.object({
        reason: z.string().min(1, 'Reason is required'),
        issueDate: z.string().date().optional(),
      }).parse(request.body);
      const service = new InvoiceService(request.server.db, request.tenantId);
      const result = await service.voidInvoice(id, body);
      return { data: result };
    },
  );

  // Hard delete — physically removes the row from sales_invoices.
  // Distinct from DELETE /:id (which is a soft cancel). Restricted to
  // draft + cancelled statuses, with up-front dependency checks (see
  // InvoiceService.hardDelete). Owner-only.
  app.delete(
    '/:id/hard',
    { preHandler: [rbacHook([...OWNER_ROLES])] },
    async (request, reply) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new InvoiceService(request.server.db, request.tenantId);
      await service.hardDelete(id);
      return reply.status(204).send();
    },
  );

  app.get(
    '/:id/receipts',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new InvoiceService(request.server.db, request.tenantId);
      const data = await service.getReceiptsForInvoice(id);
      return { data };
    },
  );

  // Batch status update — transitions multiple invoices at once (e.g.
  // draft → sent after a bulk import). Skips non-draft invoices silently.
  app.post(
    '/batch-status',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const body = z
        .object({
          invoiceIds: z.array(z.string().uuid()).min(1).max(500),
          status: z.enum(['sent', 'cancelled']),
        })
        .parse(request.body);
      const service = new InvoiceService(request.server.db, request.tenantId);
      const result = await service.batchUpdateStatus(body.invoiceIds, body.status);

      // Post revenue JEs for newly sent invoices (isAlreadyPosted prevents duplicates)
      if (body.status === 'sent' && result.updated > 0) {
        const gl = new GLService(request.server.db, request.tenantId);
        const updatedIds = body.invoiceIds.filter((id) => !result.skipped.find((s) => s.id === id));
        for (const id of updatedIds) {
          try {
            const detail = await service.getById(id);
            await gl.postSalesInvoice({
              totalAmount: detail.totalAmount,
              date: detail.invoiceDate,
              id: detail.id,
              customerName: detail.customerName,
            });
          } catch {
            // skip — invoice may have been posted already
          }
        }
      }

      return { data: result };
    },
  );

  app.post(
    '/:id/send',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = sendInvoiceSchema.parse(request.body);
      const service = new InvoiceService(request.server.db, request.tenantId);
      const invoice = await service.send(id, input);

      // Post revenue JE on send (isAlreadyPosted prevents duplicates)
      const gl = new GLService(request.server.db, request.tenantId);
      const detail = await service.getById(id);
      await gl.postSalesInvoice({
        totalAmount: detail.totalAmount,
        date: detail.invoiceDate,
        id: detail.id,
        customerName: detail.customerName,
      });

      return { data: invoice };
    },
  );

  app.post(
    '/:id/mark-paid',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = markPaidSchema.parse(request.body);
      const service = new InvoiceService(request.server.db, request.tenantId);
      const invoice = await service.markPaid(id, input);

      const webhooks = new WebhookEndpointService(request.server.db, request.tenantId);
      void webhooks.deliver('invoice.paid', {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        amountPaid: invoice.totalAmount,
        paidDate: invoice.invoiceDate,
      });

      return { data: invoice };
    },
  );

  app.post(
    '/:id/mark-paid-from-wallet',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = markPaidSchema.parse(request.body);
      const service = new InvoiceService(request.server.db, request.tenantId);
      const invoice = await service.markPaidFromWallet(id, input);

      const webhooks = new WebhookEndpointService(request.server.db, request.tenantId);
      void webhooks.deliver('invoice.paid', {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        amountPaid: invoice.totalAmount,
        paidDate: invoice.invoiceDate,
      });

      return { data: invoice };
    },
  );

  app.get(
    '/:id/upi-link',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new InvoiceService(request.server.db, request.tenantId);
      const invoice = await service.getById(id);

      const [tenantRow] = await request.server.db
        .select({ settings: tenants.settings, name: tenants.name })
        .from(tenants)
        .where(eq(tenants.id, request.tenantId))
        .limit(1);

      const settings = (tenantRow?.settings ?? {}) as Record<string, unknown>;
      const upiId = settings.upiId as string | undefined;
      if (!upiId) return { data: null };

      const link = generateUPILink({
        upiId,
        payeeName: tenantRow?.name ?? 'Company',
        amount: invoice.balanceDue,
        transactionNote: `Payment for ${invoice.invoiceNumber}`,
      });

      return { data: link };
    },
  );

  app.get(
    '/:id/interest',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new InterestService(request.server.db, request.tenantId);
      const data = await service.calculateInterest(id);
      return { data };
    },
  );
};
