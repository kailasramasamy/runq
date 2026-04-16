import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createAssetCategorySchema,
  updateAssetCategorySchema,
  createFixedAssetSchema,
  updateFixedAssetSchema,
  fixedAssetFilterSchema,
  depreciationPreviewSchema,
  depreciationRunSchema,
  disposeAssetSchema,
  transferAssetSchema,
  paginationSchema,
  uuidParamSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { AssetCategoryService } from './category.service';
import { FixedAssetService } from './asset.service';
import { DepreciationService } from './depreciation.service';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;

export const faRoutes: FastifyPluginAsync = async (app) => {
  // ─── Categories ───────────────────────────────────────────────────────

  app.get('/categories', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const svc = new AssetCategoryService(request.server.db, request.tenantId);
    return { data: await svc.list() };
  });

  app.post('/categories', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request, reply) => {
    const input = createAssetCategorySchema.parse(request.body);
    const svc = new AssetCategoryService(request.server.db, request.tenantId);
    const cat = await svc.create(input);
    return reply.status(201).send({ data: cat });
  });

  app.put('/categories/:id', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const input = updateAssetCategorySchema.parse(request.body);
    const svc = new AssetCategoryService(request.server.db, request.tenantId);
    return { data: await svc.update(id, input) };
  });

  // ─── Assets ───────────────────────────────────────────────────────────

  app.get('/', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const pagination = paginationSchema.parse(request.query);
    const filters = fixedAssetFilterSchema.parse(request.query);
    const svc = new FixedAssetService(request.server.db, request.tenantId);
    return await svc.list(filters, pagination.page, pagination.limit);
  });

  app.get('/:id', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const svc = new FixedAssetService(request.server.db, request.tenantId);
    return { data: await svc.getById(id) };
  });

  app.post('/', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request, reply) => {
    const input = createFixedAssetSchema.parse(request.body);
    const svc = new FixedAssetService(request.server.db, request.tenantId);
    const asset = await svc.create(input, request.user?.userId);
    return reply.status(201).send({ data: asset });
  });

  app.put('/:id', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const input = updateFixedAssetSchema.parse(request.body);
    const svc = new FixedAssetService(request.server.db, request.tenantId);
    return { data: await svc.update(id, input) };
  });

  // ─── Depreciation ─────────────────────────────────────────────────────

  app.get('/depreciation/preview', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const input = depreciationPreviewSchema.parse(request.query);
    const svc = new DepreciationService(request.server.db, request.tenantId);
    return { data: await svc.preview(input.periodEnd, input.depreciationType) };
  });

  app.post('/depreciation/run', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const input = depreciationRunSchema.parse(request.body);
    const svc = new DepreciationService(request.server.db, request.tenantId);
    return { data: await svc.run(input.periodEnd, input.depreciationType, request.user?.userId) };
  });

  app.get('/depreciation/block-of-assets', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const { financialYear } = z.object({ financialYear: z.string().min(4) }).parse(request.query);
    const svc = new DepreciationService(request.server.db, request.tenantId);
    return { data: await svc.blockOfAssets(financialYear) };
  });

  // ─── Disposal ─────────────────────────────────────────────────────────

  app.post('/:id/dispose', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const input = disposeAssetSchema.parse(request.body);
    const svc = new FixedAssetService(request.server.db, request.tenantId);
    return { data: await svc.dispose(id, input, request.user?.userId) };
  });

  // ─── Transfer ─────────────────────────────────────────────────────────

  app.post('/:id/transfer', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const input = transferAssetSchema.parse(request.body);
    const svc = new FixedAssetService(request.server.db, request.tenantId);
    return { data: await svc.transfer(id, input, request.user?.userId) };
  });

  // ─── Bulk Import ──────────────────────────────────────────────────────

  app.post('/import', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const file = await request.file();
    if (!file) return { error: 'No file uploaded' };
    const buffer = await file.toBuffer();
    const { AssetImportService } = await import('./import.service');
    const svc = new AssetImportService(request.server.db, request.tenantId);
    return { data: await svc.importFromBuffer(buffer, file.filename, request.user?.userId) };
  });
};
