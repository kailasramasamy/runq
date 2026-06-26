import { FastifyPluginAsync } from 'fastify';
import { qualityBandFilterSchema, upsertQualityBandsSchema } from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { QualityBandService } from './quality-band.service';

// Effective bands drive colour-coding on every persona's screens, so reads are
// open to operators/farmers; only owners/accountants tune the thresholds.
const READ_ROLES = ['owner', 'accountant', 'viewer', 'field_operator', 'farmer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;

export const qualityBandRoutes: FastifyPluginAsync = async (app) => {
  // Resolved effective bands for every milk type at a node (node override →
  // tenant default → seed). Omit nodeId for the tenant defaults.
  app.get('/', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const { nodeId } = qualityBandFilterSchema.parse(request.query);
    const service = new QualityBandService(request.server.db, request.tenantId);
    return { data: await service.resolveAll(nodeId ?? null) };
  });

  // Raw configured rows at one scope (no seed fallback) — for the settings grid.
  app.get('/config', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { nodeId } = qualityBandFilterSchema.parse(request.query);
    const service = new QualityBandService(request.server.db, request.tenantId);
    return { data: await service.listConfig(nodeId ?? null) };
  });

  app.put('/', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const input = upsertQualityBandsSchema.parse(request.body);
    const service = new QualityBandService(request.server.db, request.tenantId);
    return { data: await service.upsert(input) };
  });
};
