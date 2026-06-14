import { FastifyPluginAsync } from 'fastify';
import { collectionReportSchema } from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { ReportService } from './report.service';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;

export const reportRoutes: FastifyPluginAsync = async (app) => {
  app.get('/collection', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const q = collectionReportSchema.parse(request.query);
    const service = new ReportService(request.server.db, request.tenantId);
    return { data: await service.collectionSummary(q) };
  });
};
