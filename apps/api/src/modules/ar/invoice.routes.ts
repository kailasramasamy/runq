import { FastifyPluginAsync } from 'fastify';
import { eq } from 'drizzle-orm';
import { tenants } from '@runq/db';
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
import { generateUPILink } from '../../utils/upi/upi-link';
import { InterestService } from './interest.service';
import { NotFoundError } from '../../utils/errors';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;
const OWNER_ROLES = ['owner'] as const;

export const invoiceRoutes: FastifyPluginAsync = async (app) => {
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

  app.post(
    '/:id/send',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = sendInvoiceSchema.parse(request.body);
      const service = new InvoiceService(request.server.db, request.tenantId);
      const invoice = await service.send(id, input);
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
      if (!upiId) throw new NotFoundError('UPI ID not configured in tenant settings');

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
