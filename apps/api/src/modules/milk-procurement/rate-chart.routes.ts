import { FastifyPluginAsync } from 'fastify';
import {
  createRateChartSchema,
  rateChartFilterSchema,
  resolveRateSchema,
  paginationSchema,
  uuidParamSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { RateChartService } from './rate-chart.service';

// operators + farmers can read rate charts (not private; needed to show rates)
const READ_ROLES = ['owner', 'accountant', 'viewer', 'field_operator', 'farmer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;

export const rateChartRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const pagination = paginationSchema.parse(request.query);
    const filters = rateChartFilterSchema.parse(request.query);
    const service = new RateChartService(request.server.db, request.tenantId);
    return service.list(filters, { page: pagination.page, limit: pagination.limit });
  });

  // resolve a rate for given milk-type/fat/snf — static path before /:id
  app.get('/resolve', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const input = resolveRateSchema.parse(request.query);
    const service = new RateChartService(request.server.db, request.tenantId);
    return { data: await service.resolveRate(input) };
  });

  app.get('/:id', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const service = new RateChartService(request.server.db, request.tenantId);
    return { data: await service.getById(id) };
  });

  app.post('/', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request, reply) => {
    const input = createRateChartSchema.parse(request.body);
    const service = new RateChartService(request.server.db, request.tenantId);
    return reply.status(201).send({ data: await service.create(input) });
  });

  app.post('/:id/deactivate', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const service = new RateChartService(request.server.db, request.tenantId);
    return { data: await service.deactivate(id) };
  });
};
