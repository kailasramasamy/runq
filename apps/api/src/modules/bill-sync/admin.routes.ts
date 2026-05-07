import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { rbacHook } from '../../hooks/rbac';
import { BillSyncSourceService } from './source.service';
import { BillSyncCsvService } from './csv.service';
import { BillSyncAIMapper } from './ai-mapper.service';
import { BillSyncMappingService } from './mapping.service';

const OWNER_ROLES = ['owner'] as const;
const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;

const createSchema = z.object({
  slug: z.string().min(1).max(64),
  name: z.string().min(1).max(255),
  mode: z.enum(['api', 'csv', 'both']).optional(),
});

const idParam = z.object({ id: z.string().uuid() });

const proposeSchema = z.object({
  csv: z.string().min(1),
});

const saveMappingSchema = z.object({
  columnMapping: z.record(z.string()),
  dateFormat: z.string().optional(),
  amountFormat: z.string().optional(),
});

const previewSchema = z.object({
  csv: z.string().min(1),
});

const commitSchema = z.object({
  bills: z.array(z.object({
    payload: z.record(z.unknown()),
  })),
});

export const billSyncAdminRoutes: FastifyPluginAsync = async (app) => {
  app.get('/sources', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const svc = new BillSyncSourceService(request.server.db, request.tenantId);
    return { data: await svc.list() };
  });

  app.post('/sources', { preHandler: [rbacHook([...OWNER_ROLES])] }, async (request, reply) => {
    const input = createSchema.parse(request.body);
    const svc = new BillSyncSourceService(request.server.db, request.tenantId);
    const created = await svc.create(input);
    return reply.status(201).send({ data: created });
  });

  app.post('/sources/:id/rotate-key', { preHandler: [rbacHook([...OWNER_ROLES])] }, async (request) => {
    const { id } = idParam.parse(request.params);
    const svc = new BillSyncSourceService(request.server.db, request.tenantId);
    return { data: await svc.rotateKey(id) };
  });

  app.patch('/sources/:id/active', { preHandler: [rbacHook([...OWNER_ROLES])] }, async (request) => {
    const { id } = idParam.parse(request.params);
    const { isActive } = z.object({ isActive: z.boolean() }).parse(request.body);
    const svc = new BillSyncSourceService(request.server.db, request.tenantId);
    await svc.setActive(id, isActive);
    return { ok: true };
  });

  app.get('/sources/:id/logs', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const { id } = idParam.parse(request.params);
    const svc = new BillSyncSourceService(request.server.db, request.tenantId);
    return { data: await svc.logs(id) };
  });

  // AI mapping wizard — propose mapping for an uploaded sample
  app.post('/sources/:id/propose-mapping', { preHandler: [rbacHook([...OWNER_ROLES])] }, async (request) => {
    const { id } = idParam.parse(request.params);
    const { csv } = proposeSchema.parse(request.body);
    await new BillSyncSourceService(request.server.db, request.tenantId).getById(id);
    const lines = csv.replace(/\r\n/g, '\n').split('\n').filter(Boolean);
    const headers = lines[0]?.split(',').map((s) => s.trim().replace(/^"|"$/g, '')) ?? [];
    const sampleRows = lines.slice(1, 11).map((l) => l.split(',').map((s) => s.trim().replace(/^"|"$/g, '')));
    const mapper = new BillSyncAIMapper();
    return { data: await mapper.propose(headers, sampleRows) };
  });

  app.put('/sources/:id/mapping', { preHandler: [rbacHook([...OWNER_ROLES])] }, async (request) => {
    const { id } = idParam.parse(request.params);
    const input = saveMappingSchema.parse(request.body);
    const svc = new BillSyncSourceService(request.server.db, request.tenantId);
    await svc.saveMapping(id, input.columnMapping as Record<string, string>, input.dateFormat, input.amountFormat);
    return { ok: true };
  });

  app.post('/sources/:id/preview', { preHandler: [rbacHook([...OWNER_ROLES])] }, async (request) => {
    const { id } = idParam.parse(request.params);
    const { csv } = previewSchema.parse(request.body);
    const svc = new BillSyncCsvService(request.server.db, request.tenantId);
    return { data: await svc.preview(id, csv) };
  });

  app.post('/sources/:id/commit', { preHandler: [rbacHook([...OWNER_ROLES])] }, async (request) => {
    const { id } = idParam.parse(request.params);
    const { bills } = commitSchema.parse(request.body);
    const sourceSvc = new BillSyncSourceService(request.server.db, request.tenantId);
    const source = await sourceSvc.getById(id);
    const svc = new BillSyncCsvService(request.server.db, request.tenantId);
    const results = await svc.commit(id, source.slug, bills as Array<{ payload: never }>);
    return { data: { results } };
  });

  // ── Vendor mapping ─────────────────────────────────────────────────────────

  app.get('/sources/:id/unmapped', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const { id } = idParam.parse(request.params);
    const svc = new BillSyncMappingService(request.server.db, request.tenantId);
    return { data: await svc.listUnmapped(id) };
  });

  app.get('/sources/:id/mappings', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const { id } = idParam.parse(request.params);
    const svc = new BillSyncMappingService(request.server.db, request.tenantId);
    return { data: await svc.listMappings(id) };
  });

  app.post('/sources/:id/mappings', { preHandler: [rbacHook([...OWNER_ROLES])] }, async (request) => {
    const { id } = idParam.parse(request.params);
    const body = z.union([
      z.object({
        vendorId: z.string().uuid(),
        externalRef: z.string().min(1).max(255),
      }),
      z.object({
        newVendorName: z.string().min(1).max(255),
        externalRef: z.string().min(1).max(255),
        category: z.string().max(50).optional(),
      }),
    ]).parse(request.body);
    const svc = new BillSyncMappingService(request.server.db, request.tenantId);
    if ('vendorId' in body) {
      return { data: await svc.mapVendor(id, body.vendorId, body.externalRef) };
    }
    return { data: await svc.createAndMapVendor(id, body.newVendorName, body.externalRef, body.category) };
  });

  app.delete('/sources/:id/mappings/:vendorId', { preHandler: [rbacHook([...OWNER_ROLES])] }, async (request) => {
    const { id, vendorId } = z.object({
      id: z.string().uuid(),
      vendorId: z.string().uuid(),
    }).parse(request.params);
    const svc = new BillSyncMappingService(request.server.db, request.tenantId);
    return { data: await svc.unmapVendor(id, vendorId) };
  });
};
