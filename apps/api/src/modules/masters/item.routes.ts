import { FastifyPluginAsync } from 'fastify';
import {
  createItemSchema,
  updateItemSchema,
  itemFilterSchema,
  paginationSchema,
  uuidParamSchema,
  bulkCreateItemsSchema,
  updateItemAttributeSchemaInput,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { isAIEnabled } from '../../utils/ai/claude.service';
import { ItemService } from './item.service';
import { ItemImportService } from './item-import.service';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;
const MAX_IMPORT_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export const itemRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const pagination = paginationSchema.parse(request.query);
      const filters = itemFilterSchema.parse(request.query);
      const service = new ItemService(request.server.db, request.tenantId);
      return service.list({ page: pagination.page, limit: pagination.limit, filters });
    },
  );

  // Tenant catalogue attribute schema — lazy-seeded from the industry
  // preset on first access and stored in tenants.settings. Registered
  // before `/:id` so the literal path matches ahead of the param route.
  app.get(
    '/attribute-schema',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const service = new ItemService(request.server.db, request.tenantId);
      const schema = await service.getAttributeSchema();
      return { data: schema };
    },
  );

  app.put(
    '/attribute-schema',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { schema } = updateItemAttributeSchemaInput.parse(request.body);
      const service = new ItemService(request.server.db, request.tenantId);
      const updated = await service.updateAttributeSchema(schema);
      return { data: updated };
    },
  );

  // Sales-driven analytics rolled up by item over a recent period.
  // Optional query string ?days=N (default 90, max 366).
  app.get(
    '/sales-analytics',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const q = request.query as { days?: string };
      const days = q.days ? Number.parseInt(q.days, 10) : 90;
      const service = new ItemService(request.server.db, request.tenantId);
      const result = await service.getSalesAnalytics(days);
      return { data: result };
    },
  );

  app.get(
    '/:id',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new ItemService(request.server.db, request.tenantId);
      const item = await service.getById(id);
      return { data: item };
    },
  );

  app.post(
    '/',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const input = createItemSchema.parse(request.body);
      const service = new ItemService(request.server.db, request.tenantId);
      const item = await service.create(input);
      return reply.status(201).send({ data: item });
    },
  );

  app.put(
    '/:id',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = updateItemSchema.parse(request.body);
      const service = new ItemService(request.server.db, request.tenantId);
      const item = await service.update(id, input);
      return { data: item };
    },
  );

  app.put(
    '/:id/toggle',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new ItemService(request.server.db, request.tenantId);
      const item = await service.toggleActive(id);
      return { data: item };
    },
  );

  app.delete(
    '/:id',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new ItemService(request.server.db, request.tenantId);
      await service.remove(id);
      return reply.status(204).send();
    },
  );

  app.post(
    '/extract',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      if (!isAIEnabled()) {
        return reply.status(503).send({
          message: 'AI import requires ANTHROPIC_API_KEY to be configured.',
        });
      }

      const file = await request.file();
      if (!file) {
        return reply.status(400).send({ message: 'No file uploaded' });
      }

      const buffer = await file.toBuffer();
      if (buffer.length > MAX_IMPORT_FILE_SIZE) {
        return reply.status(400).send({
          message: 'File too large. Maximum size is 5 MB.',
        });
      }

      const service = new ItemImportService(
        request.server.db,
        request.tenantId,
      );
      const result = await service.extractFromFile(
        buffer,
        file.mimetype.toLowerCase(),
        file.filename,
      );
      return { data: result };
    },
  );

  app.post(
    '/bulk-create',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { items: inputs, mode } = bulkCreateItemsSchema.parse(request.body);
      const service = new ItemImportService(
        request.server.db,
        request.tenantId,
      );
      const result = await service.bulkCreate(inputs, mode);
      return { data: result };
    },
  );
};
