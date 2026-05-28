import { FastifyPluginAsync } from 'fastify';
import {
  previewMatchSchema,
  commitMatchSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { MatchService } from './match.service';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;

export const matchRoutes: FastifyPluginAsync = async (app) => {
  // GET /purchase/match/preview/:billId — preview match candidates for a bill.
  // Body form (POST + body { billId }) is also supported for convenience.
  app.post(
    '/preview',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const input = previewMatchSchema.parse(request.body);
      const svc = new MatchService(request.server.db, request.tenantId);
      const data = await svc.preview(input.billId);
      return { data };
    },
  );

  app.post(
    '/commit',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const input = commitMatchSchema.parse(request.body);
      const svc = new MatchService(request.server.db, request.tenantId);
      const data = await svc.commit(input, request.user?.userId);
      return { data };
    },
  );
};
