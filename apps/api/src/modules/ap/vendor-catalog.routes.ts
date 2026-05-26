import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createVendorCatalogItemSchema,
  updateVendorCatalogItemSchema,
  resolveCatalogDescriptionsSchema,
  catalogSuggestionFilterSchema,
  confirmCatalogRateChangeSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { VendorCatalogService } from './vendor-catalog.service';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;

// Routes are registered under /vendors prefix in ap/routes.ts, so paths
// here are `/:vendorId/catalog/...`.
const vendorIdParam = z.object({ vendorId: z.string().uuid() });
const vendorAndItemParam = z.object({
  vendorId: z.string().uuid(),
  itemId: z.string().uuid(),
});
const listQuerySchema = z.object({
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const vendorCatalogRoutes: FastifyPluginAsync = async (app) => {
  // GET /vendors/:vendorId/catalog
  app.get(
    '/:vendorId/catalog',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { vendorId } = vendorIdParam.parse(request.params);
      const query = listQuerySchema.parse(request.query);
      const service = new VendorCatalogService(request.server.db, request.tenantId);
      const data = await service.list(vendorId, query);
      return { data };
    },
  );

  // POST /vendors/:vendorId/catalog
  app.post(
    '/:vendorId/catalog',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { vendorId } = vendorIdParam.parse(request.params);
      const input = createVendorCatalogItemSchema.parse(request.body);
      const service = new VendorCatalogService(request.server.db, request.tenantId);
      const data = await service.create(vendorId, input);
      return reply.status(201).send({ data });
    },
  );

  // PATCH /vendors/:vendorId/catalog/:itemId
  app.patch(
    '/:vendorId/catalog/:itemId',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { vendorId, itemId } = vendorAndItemParam.parse(request.params);
      const input = updateVendorCatalogItemSchema.parse(request.body);
      const service = new VendorCatalogService(request.server.db, request.tenantId);
      const data = await service.update(vendorId, itemId, input);
      return { data };
    },
  );

  // POST /vendors/:vendorId/catalog/resolve
  app.post(
    '/:vendorId/catalog/resolve',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { vendorId } = vendorIdParam.parse(request.params);
      const { descriptions } = resolveCatalogDescriptionsSchema.parse(request.body);
      const service = new VendorCatalogService(request.server.db, request.tenantId);
      const data = await service.resolve(vendorId, descriptions);
      return { data };
    },
  );

  // GET /vendors/:vendorId/catalog/suggestions
  app.get(
    '/:vendorId/catalog/suggestions',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { vendorId } = vendorIdParam.parse(request.params);
      const filter = catalogSuggestionFilterSchema.parse(request.query);
      const service = new VendorCatalogService(request.server.db, request.tenantId);
      const data = await service.getSuggestions(vendorId, filter);
      return { data };
    },
  );

  // GET /vendors/:vendorId/catalog/:itemId/price-history
  app.get(
    '/:vendorId/catalog/:itemId/price-history',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { vendorId, itemId } = vendorAndItemParam.parse(request.params);
      const service = new VendorCatalogService(request.server.db, request.tenantId);
      const data = await service.getPriceHistory(vendorId, itemId);
      return { data };
    },
  );

  // POST /vendors/:vendorId/catalog/rate-change
  // Explicit user confirmation of a >5% rate drift surfaced by the
  // bill/PO post flow.
  app.post(
    '/:vendorId/catalog/rate-change',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      vendorIdParam.parse(request.params);
      const input = confirmCatalogRateChangeSchema.parse(request.body);
      const service = new VendorCatalogService(request.server.db, request.tenantId);
      const data = await service.confirmRateChange({
        catalogItemId: input.catalogItemId,
        newRate: input.newRate,
        sourceDocType: input.sourceDocType,
        sourceDocId: input.sourceDocId ?? null,
        changedBy: request.user?.userId,
      });
      return { data };
    },
  );
};
