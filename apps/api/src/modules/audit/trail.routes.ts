import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { rbacHook } from '../../hooks/rbac';
import { TrailService } from './trail.service';
import { GapScanService } from './gap-scan.service';
import { FixService } from './fix.service';
import { OrphanCleanupService } from './orphan-cleanup.service';
import { CustomerSplitService } from './customer-split.service';
import type { SplitRule } from './customer-split.service';

const trailParamSchema = z.object({
  entityType: z.string(),
  entityId: z.string().uuid(),
});

export const trailRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/trail/:entityType/:entityId',
    { preHandler: [rbacHook(['owner', 'accountant', 'viewer'])] },
    async (request) => {
      const { entityType, entityId } = trailParamSchema.parse(request.params);
      const service = new TrailService(request.server.db, request.tenantId);
      const trail = await service.getTrail(entityType, entityId);
      return { data: trail };
    },
  );

  app.get(
    '/gap-scan',
    { preHandler: [rbacHook(['owner', 'accountant'])] },
    async (request) => {
      const query = request.query as { days?: string };
      const days = query.days ? parseInt(query.days, 10) : 90;
      const service = new GapScanService(request.server.db, request.tenantId);
      const result = await service.scanSummary(days);
      return { data: result };
    },
  );

  const gapItemsParamSchema = z.object({ key: z.string() });

  app.get(
    '/gap-scan/:key/items',
    { preHandler: [rbacHook(['owner', 'accountant'])] },
    async (request) => {
      const { key } = gapItemsParamSchema.parse(request.params);
      const query = request.query as { days?: string };
      const days = query.days ? parseInt(query.days, 10) : 90;
      const service = new GapScanService(request.server.db, request.tenantId);
      const result = await service.getCategoryItems(key, days);
      return { data: result };
    },
  );

  app.post(
    '/fix/:entityType/:entityId',
    { preHandler: [rbacHook(['owner', 'accountant'])] },
    async (request) => {
      const { entityType, entityId } = trailParamSchema.parse(request.params);
      const service = new FixService(request.server.db, request.tenantId);

      const mode = (request.query as { mode?: string }).mode;

      if (entityType === 'bank_transaction') {
        const result = mode === 'unmatch'
          ? await service.unmatchBankTransaction(entityId)
          : await service.fixBankTransaction(entityId);
        return { data: result };
      }
      if (entityType === 'purchase_invoice') {
        const result = await service.fixPurchaseInvoice(entityId);
        return { data: result };
      }
      if (entityType === 'sales_invoice') {
        const result = await service.fixSalesInvoice(entityId);
        return { data: result };
      }
      if (entityType === 'receipt') {
        const result = await service.fixReceipt(entityId);
        return { data: result };
      }
      if (entityType === 'orphan_artifact') {
        // entityId is the audit_log row id — see GapScanService.itemFetchers
        const cleanup = new OrphanCleanupService(request.server.db, request.tenantId);
        const result = await cleanup.reverseByAuditLog(entityId);
        return { data: result };
      }

      return { data: { steps: [], allFixed: false, manualRequired: [`Fix not supported for ${entityType} yet`] } };
    },
  );

  const splitSchema = z.object({
    sourceCustomerId: z.string().uuid(),
    targetCustomerId: z.string().uuid(),
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    rule: z.enum(['larger_per_day', 'smaller_per_day']),
  });

  app.post(
    '/customer-split/preview',
    { preHandler: [rbacHook(['owner', 'accountant'])] },
    async (request) => {
      const input = splitSchema.parse(request.body);
      const service = new CustomerSplitService(request.server.db, request.tenantId);
      const result = await service.preview({ ...input, rule: input.rule as SplitRule });
      return { data: result };
    },
  );

  app.post(
    '/customer-split/apply',
    { preHandler: [rbacHook(['owner', 'accountant'])] },
    async (request) => {
      const input = splitSchema.parse(request.body);
      const service = new CustomerSplitService(request.server.db, request.tenantId);
      const result = await service.apply({ ...input, rule: input.rule as SplitRule }, request.user?.userId);
      return { data: result };
    },
  );
};
