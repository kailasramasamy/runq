import { FastifyPluginAsync } from 'fastify';
import { collectionReportSchema } from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { ReportService } from './report.service';
import { resolveMpPrincipal, assertNodeAccess } from './access-scope';

// field_operator reads their own node's rollup (service scopes pours to it)
const READ_ROLES = ['owner', 'accountant', 'viewer', 'field_operator'] as const;

export const reportRoutes: FastifyPluginAsync = async (app) => {
  app.get('/collection', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const q = collectionReportSchema.parse(request.query);
    const principal = await resolveMpPrincipal(request);
    if (principal.kind === 'operator' && q.nodeId) assertNodeAccess(principal, q.nodeId);
    const service = new ReportService(request.server.db, request.tenantId);
    return { data: await service.collectionSummary(q, principal) };
  });
};
