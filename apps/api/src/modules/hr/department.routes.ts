import { FastifyPluginAsync } from 'fastify';
import {
  createDepartmentSchema,
  updateDepartmentSchema,
  uuidParamSchema,
  suggestHrSchema,
  bulkCreateDepartmentsSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { DepartmentService } from './department.service';
import { suggestDepartments } from './ai-suggest.service';

const ALL = ['owner', 'accountant', 'viewer', 'hr'] as const;
const WRITE = ['owner', 'accountant', 'hr'] as const;

export const departmentRoutes: FastifyPluginAsync = async (app) => {
  app.get('/departments', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const svc = new DepartmentService(req.server.db, req.tenantId);
    return { data: await svc.list() };
  });

  app.post('/departments', { preHandler: [rbacHook([...WRITE])] }, async (req, reply) => {
    const input = createDepartmentSchema.parse(req.body);
    const svc = new DepartmentService(req.server.db, req.tenantId);
    return reply.status(201).send({ data: await svc.create(input) });
  });

  app.post('/departments/suggest', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { description } = suggestHrSchema.parse(req.body);
    return { data: { suggestions: await suggestDepartments(description) } };
  });

  app.post('/departments/bulk', { preHandler: [rbacHook([...WRITE])] }, async (req, reply) => {
    const { departments } = bulkCreateDepartmentsSchema.parse(req.body);
    const svc = new DepartmentService(req.server.db, req.tenantId);
    return reply.status(201).send({ data: await svc.bulkCreate(departments) });
  });

  app.put('/departments/:id', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = updateDepartmentSchema.parse(req.body);
    const svc = new DepartmentService(req.server.db, req.tenantId);
    return { data: await svc.update(id, input) };
  });

  app.delete('/departments/:id', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new DepartmentService(req.server.db, req.tenantId);
    return { data: await svc.remove(id) };
  });
};
