import { FastifyPluginAsync } from 'fastify';
import {
  createQcTestSchema,
  qcTestFilterSchema,
  paginationSchema,
  uuidParamSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { QcTestService } from './qc-test.service';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;

export const qcTestRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const pagination = paginationSchema.parse(request.query);
    const filters = qcTestFilterSchema.parse(request.query);
    const service = new QcTestService(request.server.db, request.tenantId);
    return service.list(filters, { page: pagination.page, limit: pagination.limit });
  });

  app.get('/:id', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const service = new QcTestService(request.server.db, request.tenantId);
    return { data: await service.getById(id) };
  });

  app.post('/', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request, reply) => {
    const input = createQcTestSchema.parse(request.body);
    const service = new QcTestService(request.server.db, request.tenantId);
    return reply.status(201).send({ data: await service.create(input, request.user?.userId) });
  });
};
