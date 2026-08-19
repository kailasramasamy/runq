import { FastifyPluginAsync } from 'fastify';
import { collectionReportSchema, receivedDailySchema, poursDailySchema, suppliedDailySchema, qualityTrendSchema, nodeDailySchema, farmerDailySchema, flowReportSchema } from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { ReportService } from './report.service';
import { resolveMpPrincipal, assertNodeAccess } from './access-scope';

// field_operator reads their own node's rollup (service scopes pours to it)
const READ_ROLES = ['owner', 'accountant', 'viewer', 'field_operator'] as const;
// Flow is a whole-network view — tenant-side roles only, not per-node operators.
const FLOW_ROLES = ['owner', 'accountant', 'viewer'] as const;

export const reportRoutes: FastifyPluginAsync = async (app) => {
  app.get('/collection', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const q = collectionReportSchema.parse(request.query);
    const principal = await resolveMpPrincipal(request);
    if (principal.kind === 'operator' && q.nodeId) assertNodeAccess(principal, q.nodeId);
    const service = new ReportService(request.server.db, request.tenantId);
    return { data: await service.collectionSummary(q, principal) };
  });

  app.get('/received-daily', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const q = receivedDailySchema.parse(request.query);
    const principal = await resolveMpPrincipal(request);
    if (principal.kind === 'operator') assertNodeAccess(principal, q.nodeId);
    const service = new ReportService(request.server.db, request.tenantId);
    return { data: await service.receivedDaily(q) };
  });

  app.get('/pours-daily', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const q = poursDailySchema.parse(request.query);
    const principal = await resolveMpPrincipal(request);
    if (principal.kind === 'operator') assertNodeAccess(principal, q.nodeId);
    const service = new ReportService(request.server.db, request.tenantId);
    return { data: await service.poursDaily(q, principal) };
  });

  // A VMCC whose farmers aren't tracked: its supply exists only as the CC's
  // manual receipts, so this is what its own operator reads instead of pours.
  app.get('/supplied-daily', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const q = suppliedDailySchema.parse(request.query);
    const principal = await resolveMpPrincipal(request);
    if (principal.kind === 'operator') assertNodeAccess(principal, q.nodeId);
    const service = new ReportService(request.server.db, request.tenantId);
    return { data: await service.suppliedDaily(q, principal) };
  });

  app.get('/quality-trend', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const q = qualityTrendSchema.parse(request.query);
    const principal = await resolveMpPrincipal(request);
    if (principal.kind === 'operator' && q.nodeId) assertNodeAccess(principal, q.nodeId);
    const service = new ReportService(request.server.db, request.tenantId);
    return { data: await service.qualityTrend(q, principal) };
  });

  app.get('/milk-type-daily', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const q = qualityTrendSchema.parse(request.query);
    const principal = await resolveMpPrincipal(request);
    if (principal.kind === 'operator' && q.nodeId) assertNodeAccess(principal, q.nodeId);
    const service = new ReportService(request.server.db, request.tenantId);
    return { data: await service.milkTypeDaily(q, principal) };
  });

  app.get('/node-daily', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const q = nodeDailySchema.parse(request.query);
    const principal = await resolveMpPrincipal(request);
    const service = new ReportService(request.server.db, request.tenantId);
    return { data: await service.nodeDaily(q, principal) };
  });

  app.get('/farmer-daily', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const q = farmerDailySchema.parse(request.query);
    const principal = await resolveMpPrincipal(request);
    if (principal.kind === 'operator' && q.nodeId) assertNodeAccess(principal, q.nodeId);
    const service = new ReportService(request.server.db, request.tenantId);
    return { data: await service.farmerDaily(q, principal) };
  });

  app.get('/flow', { preHandler: [rbacHook([...FLOW_ROLES])] }, async (request) => {
    const q = flowReportSchema.parse(request.query);
    const service = new ReportService(request.server.db, request.tenantId);
    return { data: await service.flow(q) };
  });
};
