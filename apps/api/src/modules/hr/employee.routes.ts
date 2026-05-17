import { FastifyPluginAsync } from 'fastify';
import {
  createEmployeeSchema, updateEmployeeSchema, employeeFilterSchema, uuidParamSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { EmployeeService } from './employee.service';
import { resolveHrAccessScope } from './access-scope';

// `viewer` covers regular employees; `hr` is People Ops with tenant-wide read.
const ALL = ['owner', 'accountant', 'viewer', 'hr'] as const;
// `hr` can also create/update employees — they're the People Ops persona.
const WRITE = ['owner', 'accountant', 'hr'] as const;

export const employeeRoutes: FastifyPluginAsync = async (app) => {
  app.get('/employees', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const filter = employeeFilterSchema.parse(req.query);
    const scope = await resolveHrAccessScope(req);
    const svc = new EmployeeService(req.server.db, req.tenantId, scope);
    return await svc.list(filter);
  });

  app.get('/employees/:id', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const scope = await resolveHrAccessScope(req);
    const svc = new EmployeeService(req.server.db, req.tenantId, scope);
    return { data: await svc.getById(id) };
  });

  app.post('/employees', { preHandler: [rbacHook([...WRITE])] }, async (req, reply) => {
    const input = createEmployeeSchema.parse(req.body);
    // Create bypasses scope intentionally — managers/HR adding a new
    // employee shouldn't be blocked because that employee isn't yet in
    // their subtree (they're not even in the DB yet).
    const svc = new EmployeeService(req.server.db, req.tenantId);
    return reply.status(201).send({ data: await svc.create(input) });
  });

  app.put('/employees/:id', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = updateEmployeeSchema.parse(req.body);
    // Update goes through scope — a manager can only edit their subtree.
    const scope = await resolveHrAccessScope(req);
    const svc = new EmployeeService(req.server.db, req.tenantId, scope);
    return { data: await svc.update(id, input) };
  });

  app.delete('/employees/:id', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const scope = await resolveHrAccessScope(req);
    const svc = new EmployeeService(req.server.db, req.tenantId, scope);
    return { data: await svc.remove(id) };
  });
};
