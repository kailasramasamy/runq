
import { FastifyPluginAsync } from 'fastify';
import {
  createPurchaseInvoiceSchema,
  updatePurchaseInvoiceSchema,
  purchaseInvoiceFilterSchema,
  threeWayMatchSchema,
  approveInvoiceSchema,
  paginationSchema,
  uuidParamSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { PurchaseInvoiceService } from './purchase-invoice.service';
import { ThreeWayMatchService } from './three-way-match.service';
import { DuplicateService } from './duplicate.service';
import { AnomalyService } from './anomaly.service';
import { checkDuplicatesSchema } from './duplicate.schema';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;
const OWNER_ROLES = ['owner'] as const;

export const purchaseInvoiceRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/anomalies',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const service = new AnomalyService(request.server.db, request.tenantId);
      const anomalies = await service.detectAnomalies();
      return { data: anomalies };
    },
  );

  app.get(
    '/',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const pagination = paginationSchema.parse(request.query);
      const filters = purchaseInvoiceFilterSchema.parse(request.query);
      const service = new PurchaseInvoiceService(request.server.db, request.tenantId);
      return service.list({ page: pagination.page, limit: pagination.limit, filters });
    },
  );

  app.get(
    '/:id',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new PurchaseInvoiceService(request.server.db, request.tenantId);
      const invoice = await service.getById(id);
      return { data: invoice };
    },
  );

  app.post(
    '/',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const input = createPurchaseInvoiceSchema.parse(request.body);
      const service = new PurchaseInvoiceService(request.server.db, request.tenantId);
      const invoice = await service.create(input);
      return reply.status(201).send({ data: invoice });
    },
  );

  app.put(
    '/:id',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = updatePurchaseInvoiceSchema.parse(request.body);
      const service = new PurchaseInvoiceService(request.server.db, request.tenantId);
      const invoice = await service.update(id, input);
      return { data: invoice };
    },
  );

  app.delete(
    '/:id',
    { preHandler: [rbacHook([...OWNER_ROLES])] },
    async (request, reply) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new PurchaseInvoiceService(request.server.db, request.tenantId);
      await service.cancel(id);
      return reply.status(204).send();
    },
  );

  app.post(
    '/:id/match',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const { poId, grnId } = threeWayMatchSchema.parse(request.body);
      const service = new ThreeWayMatchService(request.server.db, request.tenantId);
      const result = await service.performMatch(id, poId, grnId);
      return { data: result };
    },
  );

  app.get(
    '/:id/match-status',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new PurchaseInvoiceService(request.server.db, request.tenantId);
      const invoice = await service.getById(id);
      return {
        data: {
          invoiceId: invoice.id,
          status: invoice.status,
          matchStatus: invoice.matchStatus,
          matchNotes: invoice.matchNotes,
          poId: invoice.poId,
          grnId: invoice.grnId,
        },
      };
    },
  );

  app.post(
    '/:id/approve',
    { preHandler: [rbacHook([...OWNER_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      approveInvoiceSchema.parse(request.body);
      const matchService = new ThreeWayMatchService(request.server.db, request.tenantId);
      await matchService.approve(id, request.user.userId);
      const invoiceService = new PurchaseInvoiceService(request.server.db, request.tenantId);
      const invoice = await invoiceService.getById(id);
      return { data: invoice };
    },
  );

  app.post(
    '/check-duplicates',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const input = checkDuplicatesSchema.parse(request.body);
      const service = new DuplicateService(request.server.db, request.tenantId);
      const result = await service.checkDuplicates(input);
      return { data: result };
    },
  );
};
