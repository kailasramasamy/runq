import { FastifyPluginAsync } from 'fastify';
import {
  closeShiftSchema, reopenShiftSchema, shiftStatusQuerySchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { ShiftClosureService } from './shift-closure.service';
import { resolveMpPrincipal } from './access-scope';

// Reopen is a write — operator + accountant + owner (a dispatched slot is
// locked regardless, enforced in the service).
const READ_ROLES = ['owner', 'accountant', 'viewer', 'field_operator'] as const;
const WRITE_ROLES = ['owner', 'accountant', 'field_operator'] as const;

export const shiftClosureRoutes: FastifyPluginAsync = async (app) => {
  app.get('/status', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const q = shiftStatusQuerySchema.parse(request.query);
    const principal = await resolveMpPrincipal(request);
    const service = new ShiftClosureService(request.server.db, request.tenantId);
    return { data: await service.status(q.nodeId, q.date, principal) };
  });

  app.post('/close', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const input = closeShiftSchema.parse(request.body);
    const principal = await resolveMpPrincipal(request);
    const service = new ShiftClosureService(request.server.db, request.tenantId);
    return { data: await service.closeShift(input, request.user?.userId, principal) };
  });

  app.post('/reopen', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const input = reopenShiftSchema.parse(request.body);
    const principal = await resolveMpPrincipal(request);
    const service = new ShiftClosureService(request.server.db, request.tenantId);
    return { data: await service.reopenShift(input, request.user?.userId, principal) };
  });
};
