import { FastifyPluginAsync } from 'fastify';
import {
  woSummaryFilterSchema,
  yieldTrendFilterSchema,
  bomUsageFilterSchema,
  woPendingCloseFilterSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { ManufacturingReportsService } from './reports.service';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;

/** Mounted at /manufacturing/dashboard */
export const dashboardRoute: FastifyPluginAsync = async (app) => {
  app.get(
    '/',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const service = new ManufacturingReportsService(request.server.db, request.tenantId);
      const data = await service.getDashboard();
      return { data };
    },
  );
};

/** Mounted at /manufacturing/reports */
export const reportsRoutes: FastifyPluginAsync = async (app) => {
  // GET /manufacturing/reports/wo-summary
  app.get(
    '/wo-summary',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const filter = woSummaryFilterSchema.parse(request.query);
      const service = new ManufacturingReportsService(request.server.db, request.tenantId);
      const data = await service.woSummary(filter);
      return { data };
    },
  );

  // GET /manufacturing/reports/yield-trend
  app.get(
    '/yield-trend',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const filter = yieldTrendFilterSchema.parse(request.query);
      const service = new ManufacturingReportsService(request.server.db, request.tenantId);
      const data = await service.yieldTrend(filter);
      return { data };
    },
  );

  // GET /manufacturing/reports/bom-usage
  app.get(
    '/bom-usage',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const filter = bomUsageFilterSchema.parse(request.query);
      const service = new ManufacturingReportsService(request.server.db, request.tenantId);
      const data = await service.bomUsage(filter);
      return { data };
    },
  );

  // GET /manufacturing/reports/wo-pending-close
  app.get(
    '/wo-pending-close',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const filter = woPendingCloseFilterSchema.parse(request.query);
      const service = new ManufacturingReportsService(request.server.db, request.tenantId);
      const data = await service.woPendingClose(filter);
      return { data };
    },
  );
};
