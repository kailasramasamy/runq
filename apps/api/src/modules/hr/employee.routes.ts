import { FastifyPluginAsync } from 'fastify';
import {
  createEmployeeSchema, updateEmployeeSchema, employeeFilterSchema, uuidParamSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { EmployeeService } from './employee.service';
import { resolveHrAccessScope } from './access-scope';

// `viewer` covers regular employees; `hr` is People Ops with tenant-wide read.
const ALL = ['owner', 'accountant', 'viewer', 'hr', 'technician'] as const;
// `hr` can also create/update employees — they're the People Ops persona.
const WRITE = ['owner', 'accountant', 'hr'] as const;

export const employeeRoutes: FastifyPluginAsync = async (app) => {
  app.get('/employees', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const filter = employeeFilterSchema.parse(req.query);
    const scope = await resolveHrAccessScope(req);
    const svc = new EmployeeService(req.server.db, req.tenantId, scope);
    return await svc.list(filter);
  });

  // Preview of the code create would assign, so the new-employee form can
  // prefill it. Only a suggestion — two people opening the form at once
  // see the same value, and whoever saves second gets the next one from
  // create()'s own generation. Declared before /employees/:id; Fastify
  // matches the static segment first regardless, but keeping them
  // adjacent makes the precedence obvious.
  app.get('/employees/next-code', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const svc = new EmployeeService(req.server.db, req.tenantId);
    return { data: { employeeCode: await svc.nextEmployeeCode() } };
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

  // Clear a locked / mis-bound mobile login so the employee can re-bind their
  // Google/Apple account with their date of birth.
  app.post('/employees/:id/reset-mobile-login', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const scope = await resolveHrAccessScope(req);
    const svc = new EmployeeService(req.server.db, req.tenantId, scope);
    return { data: await svc.resetMobileLogin(id) };
  });
};
