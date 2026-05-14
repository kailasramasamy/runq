import { FastifyPluginAsync } from 'fastify';
import {
  createEmployeeSchema, updateEmployeeSchema, employeeFilterSchema, uuidParamSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { EmployeeService } from './employee.service';

const ALL = ['owner', 'accountant', 'viewer'] as const;
const WRITE = ['owner', 'accountant'] as const;

export const employeeRoutes: FastifyPluginAsync = async (app) => {
  app.get('/employees', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const filter = employeeFilterSchema.parse(req.query);
    const svc = new EmployeeService(req.server.db, req.tenantId);
    return await svc.list(filter);
  });

  app.get('/employees/:id', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new EmployeeService(req.server.db, req.tenantId);
    return { data: await svc.getById(id) };
  });

  app.post('/employees', { preHandler: [rbacHook([...WRITE])] }, async (req, reply) => {
    const input = createEmployeeSchema.parse(req.body);
    const svc = new EmployeeService(req.server.db, req.tenantId);
    return reply.status(201).send({ data: await svc.create(input) });
  });

  app.put('/employees/:id', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = updateEmployeeSchema.parse(req.body);
    const svc = new EmployeeService(req.server.db, req.tenantId);
    return { data: await svc.update(id, input) };
  });

  app.delete('/employees/:id', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new EmployeeService(req.server.db, req.tenantId);
    return { data: await svc.remove(id) };
  });
};
