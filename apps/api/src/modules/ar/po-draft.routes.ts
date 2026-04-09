import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  paginationSchema,
  poInboxFilterSchema,
  uuidParamSchema,
  updatePoDraftSchema,
  updatePoDraftLineSchema,
  rejectPoDraftSchema,
  bulkApprovePoDraftsSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { PoDraftService } from './po-draft.service';
import { GLService } from '../gl/gl.service';
import { InvoiceService } from './invoice.service';
import { WebhookEndpointService } from '../webhooks/webhook-endpoint.service';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;

const lineParamsSchema = z.object({
  id: z.string().uuid(),
  lineId: z.string().uuid(),
});

export const poDraftRoutes: FastifyPluginAsync = async (app) => {
  // GET / — paginated inbox list. Powers the PO Inbox screen.
  app.get(
    '/',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const pagination = paginationSchema.parse(request.query);
      const filters = poInboxFilterSchema.parse(request.query);
      const service = new PoDraftService(request.server.db, request.tenantId);
      return service.listInbox({
        page: pagination.page,
        limit: pagination.limit,
        filters,
      });
    },
  );

  // GET /:id — single inbox item with parsed lines.
  app.get(
    '/:id',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new PoDraftService(request.server.db, request.tenantId);
      const data = await service.getById(id);
      return { data };
    },
  );

  // PATCH /:id — update header fields (customer, PO number, dates).
  app.patch(
    '/:id',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = updatePoDraftSchema.parse(request.body);
      const service = new PoDraftService(request.server.db, request.tenantId);
      await service.update(id, input);
      // Re-fetch via the unified detail shape so the client gets one consistent
      // payload back instead of two slightly different ones.
      const data = await service.getById(id);
      return { data };
    },
  );

  // PATCH /:id/lines/:lineId — edit a single line. Triggers rate re-resolve
  // and (when an item is picked) records the customer SKU alias.
  app.patch(
    '/:id/lines/:lineId',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id, lineId } = lineParamsSchema.parse(request.params);
      const input = updatePoDraftLineSchema.parse(request.body);
      const service = new PoDraftService(request.server.db, request.tenantId);
      await service.updateLine(id, lineId, input);
      const data = await service.getById(id);
      return { data };
    },
  );

  // POST /:id/approve — convert the draft into a status='draft' sales_invoices
  // row. Mirrors the existing AR invoice creation route: post to GL and fire
  // the invoice.created webhook so downstream consumers see the new draft.
  app.post(
    '/:id/approve',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { id } = uuidParamSchema.parse(request.params);
      const userId = request.user!.userId;

      const service = new PoDraftService(request.server.db, request.tenantId);
      const { invoiceId, invoiceNumber } = await service.approve(id, userId);

      // Mirror /ar/invoices POST: post to GL + deliver webhook for the new draft.
      const invoiceService = new InvoiceService(request.server.db, request.tenantId);
      const created = await invoiceService.getById(invoiceId);

      const gl = new GLService(request.server.db, request.tenantId);
      await gl.postSalesInvoice({
        totalAmount: created.totalAmount,
        date: created.invoiceDate,
        id: created.id,
        customerName: created.customerName,
      });

      const webhooks = new WebhookEndpointService(request.server.db, request.tenantId);
      void webhooks.deliver('invoice.created', {
        invoiceId: created.id,
        invoiceNumber: created.invoiceNumber,
        customerName: created.customerName,
        totalAmount: created.totalAmount,
        invoiceDate: created.invoiceDate,
      });

      return reply.status(201).send({ data: { invoiceId, invoiceNumber } });
    },
  );

  // POST /bulk-approve — convert N ready drafts at once. Fail-soft per item.
  // Mirrors single-approve for GL post + webhook delivery on each successful
  // invoice. Failed items are returned with reasons in the response.
  app.post(
    '/bulk-approve',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const input = bulkApprovePoDraftsSchema.parse(request.body);
      const userId = request.user!.userId;

      const service = new PoDraftService(request.server.db, request.tenantId);
      const result = await service.bulkApprove(input.uploadIds, userId);

      // Fan out GL posting + webhook delivery for everything we successfully
      // created. Each call is independent — one failure here doesn't roll
      // back the others (the invoice rows are already committed).
      const invoiceService = new InvoiceService(request.server.db, request.tenantId);
      const gl = new GLService(request.server.db, request.tenantId);
      const webhooks = new WebhookEndpointService(request.server.db, request.tenantId);

      for (const ok of result.created) {
        try {
          const created = await invoiceService.getById(ok.invoiceId);
          await gl.postSalesInvoice({
            totalAmount: created.totalAmount,
            date: created.invoiceDate,
            id: created.id,
            customerName: created.customerName,
          });
          void webhooks.deliver('invoice.created', {
            invoiceId: created.id,
            invoiceNumber: created.invoiceNumber,
            customerName: created.customerName,
            totalAmount: created.totalAmount,
            invoiceDate: created.invoiceDate,
          });
        } catch (err) {
          // GL/webhook failure is non-fatal at this stage — the invoice exists.
          // eslint-disable-next-line no-console
          console.error(`[bulk-approve] post-create side-effects failed for ${ok.invoiceId}:`, err);
        }
      }

      return reply.status(201).send({ data: result });
    },
  );

  // POST /:id/reject — record reason and stop the workflow.
  app.post(
    '/:id/reject',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = rejectPoDraftSchema.parse(request.body);
      const userId = request.user!.userId;
      const service = new PoDraftService(request.server.db, request.tenantId);
      await service.reject(id, userId, input.reason);
      const data = await service.getById(id);
      return { data };
    },
  );
};
