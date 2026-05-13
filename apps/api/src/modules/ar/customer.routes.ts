import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createCustomerSchema,
  updateCustomerSchema,
  customerFilterSchema,
  paginationSchema,
  uuidParamSchema,
  syncCustomersSchema,
  importCustomersCSVSchema,
} from '@runq/validators';

const verifyGstinBodySchema = z.object({ gstin: z.string().length(15) });
import { rbacHook } from '../../hooks/rbac';
import { WebhookEndpointService } from '../webhooks/webhook-endpoint.service';
import { CustomerService } from './customer.service';
import { CreditScoreService } from './credit-score.service';
import { PortalService } from './portal.service';
import { validateGSTIN } from '@runq/validators';
import { lookupGSTIN } from '../../utils/gstin-lookup';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;
const OWNER_ROLES = ['owner'] as const;
const SYNC_ROLES = ['owner', 'accountant'] as const;

export const customerRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const pagination = paginationSchema.parse(request.query);
      const filters = customerFilterSchema.parse(request.query);
      const service = new CustomerService(request.server.db, request.tenantId);
      return service.list({
        page: pagination.page,
        limit: pagination.limit,
        search: filters.search,
        type: filters.type,
        hasOutstanding: filters.hasOutstanding,
        includeInactive: filters.includeInactive,
        active: filters.active,
      });
    },
  );

  app.get(
    '/:id',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new CustomerService(request.server.db, request.tenantId);
      const customer = await service.getById(id);
      return { data: customer };
    },
  );

  app.post(
    '/',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const input = createCustomerSchema.parse(request.body);
      const service = new CustomerService(request.server.db, request.tenantId);
      const customer = await service.create(input);

      const webhooks = new WebhookEndpointService(request.server.db, request.tenantId);
      void webhooks.deliver('customer.created', {
        customerId: customer.id,
        name: customer.name,
        email: customer.email,
      });

      return reply.status(201).send({ data: customer });
    },
  );

  app.put(
    '/:id',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = updateCustomerSchema.parse(request.body);
      const service = new CustomerService(request.server.db, request.tenantId);
      const customer = await service.update(id, input);
      return { data: customer };
    },
  );

  app.delete(
    '/:id',
    { preHandler: [rbacHook([...OWNER_ROLES])] },
    async (request, reply) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new CustomerService(request.server.db, request.tenantId);
      await service.softDelete(id);
      return reply.status(204).send();
    },
  );

  app.post(
    '/verify-gstin',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { gstin } = verifyGstinBodySchema.parse(request.body);

      const validation = validateGSTIN(gstin);
      if (!validation.valid) return { data: null, error: validation.error };

      const lookup = await lookupGSTIN(gstin);
      return { data: lookup, checksum: 'valid' };
    },
  );

  app.post(
    '/sync',
    { preHandler: [rbacHook([...SYNC_ROLES])] },
    async (request) => {
      const { customers: customerList } = syncCustomersSchema.parse(request.body);
      const service = new CustomerService(request.server.db, request.tenantId);
      const result = await service.syncCustomers(customerList);
      return { data: result };
    },
  );

  app.post(
    '/import',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { csvData } = importCustomersCSVSchema.parse(request.body);
      const service = new CustomerService(request.server.db, request.tenantId);
      const result = await service.importFromCSV(csvData);
      return { data: result };
    },
  );

  app.get(
    '/:id/credit-score',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new CreditScoreService(request.server.db, request.tenantId);
      const data = await service.getScore(id);
      return { data };
    },
  );

  app.post(
    '/:id/portal-token',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new PortalService(request.server.db, request.tenantId);
      const slug = await service.getOrCreateSlug(id);
      return { data: { slug } };
    },
  );

  app.get('/:id/portal-slug', async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const service = new PortalService(request.server.db, request.tenantId);
    const slug = await service.getExistingSlug(id);
    return { data: { slug } };
  });

  app.get('/:id/portal-pin-status', async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const service = new PortalService(request.server.db, request.tenantId);
    const pin = await service.getPin(id);
    return { data: { isSet: !!pin, pin } };
  });

  app.post(
    '/:id/portal-pin',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      // Generate a 4-digit PIN server-side so the AR person never has to invent one.
      const pin = String(Math.floor(1000 + Math.random() * 9000));
      const service = new PortalService(request.server.db, request.tenantId);
      await service.setPin(id, pin);
      return { data: { pin } };
    },
  );

  app.delete(
    '/:id/portal-pin',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new PortalService(request.server.db, request.tenantId);
      await service.clearPin(id);
      return { ok: true };
    },
  );
};
