import { FastifyPluginAsync } from 'fastify';
import {
  createRateChartSchema,
  rateChartFilterSchema,
  resolveRateSchema,
  rateAssignmentScopeSchema,
  assignRateChartSchema,
  unassignRateChartSchema,
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

  // ── assignments: which chart prices a (scope, milk type, family) ───────────
  app.get('/assignments', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const q = rateAssignmentScopeSchema.parse(request.query);
    const service = new RateChartService(request.server.db, request.tenantId);
    return { data: await service.listAssignments(q.scopeType, q.scopeId ?? 'tenant') };
  });

  // what actually prices each slot here, and whether it's inherited
  app.get('/assignments/effective', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const q = rateAssignmentScopeSchema.parse(request.query);
    const service = new RateChartService(request.server.db, request.tenantId);
    return { data: await service.effectiveAssignments(q.scopeType, q.scopeId ?? 'tenant') };
  });

  app.put('/assignments', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const input = assignRateChartSchema.parse(request.body);
    const service = new RateChartService(request.server.db, request.tenantId);
    await service.assign(input.scopeType, input.scopeId ?? 'tenant', input.rateChartId);
    return { data: await service.listAssignments(input.scopeType, input.scopeId ?? 'tenant') };
  });

  // query, not body — DELETE bodies aren't universally carried by clients
  app.delete('/assignments', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const input = unassignRateChartSchema.parse(request.query);
    const service = new RateChartService(request.server.db, request.tenantId);
    await service.unassign(input.scopeType, input.scopeId ?? 'tenant', input.milkType, input.pricingFamily);
    return { data: await service.listAssignments(input.scopeType, input.scopeId ?? 'tenant') };
  });

  app.get('/:id', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const service = new RateChartService(request.server.db, request.tenantId);
    return { data: await service.getById(id) };
  });

  // Printable rate chart (PDF by default, ?format=html to debug).
  app.get('/:id/print', { preHandler: [rbacHook([...READ_ROLES])] }, async (request, reply) => {
    const { id } = uuidParamSchema.parse(request.params);
    const format = (request.query as { format?: string }).format;
    const service = new RateChartService(request.server.db, request.tenantId);
    const data = await service.getPrintData(id, new Date().toISOString());
    const { renderRateChartHTML } = await import('./rate-chart-template');
    const html = renderRateChartHTML(data);
    if (format === 'html') return reply.type('text/html').send(html);
    const { renderHtmlToPdf } = await import('../ar/invoice-pdf');
    const pdf = await renderHtmlToPdf(html);
    const fname = `rate-chart-${data.chart.name}-${data.chart.effectiveFrom}.pdf`.replace(/[^\w.\-]/g, '-');
    return reply.type('application/pdf')
      .header('Content-Disposition', `inline; filename="${fname}"`).send(pdf);
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
