import { FastifyPluginAsync } from 'fastify';
import { AccountService } from './account.service';

/**
 * Self-serve account deletion (Apple guideline 5.1.1(v)). The caller deletes
 * their OWN account — no id param, so it is inherently self-scoped. Registered
 * in the authenticated scope, so `request.user` and `request.tenantId` are set.
 */
export const accountRoutes: FastifyPluginAsync = async (app) => {
  app.delete('/', async (request, reply) => {
    const service = new AccountService(request.server.db, request.tenantId);
    await service.deleteSelf(request.user!.userId);
    return reply.status(204).send();
  });
};
