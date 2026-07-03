import { FastifyPluginAsync } from 'fastify';
import { rbacHook } from '../../hooks/rbac';
import { ForbiddenError } from '../../utils/errors';
import { resolveMpPrincipal } from './access-scope';
import { MpAccountService } from './account.service';

/**
 * Self-serve Dhenu account deletion (Apple guideline 5.1.1(v)). The caller
 * deletes their OWN account — there is no id param, so it is inherently
 * self-scoped. Farmers and field operators only; owners/accountants are
 * web-created business accounts managed on the web, not here.
 */
export const accountRoutes: FastifyPluginAsync = async (app) => {
  app.delete('/', { preHandler: [rbacHook(['farmer', 'field_operator'])] }, async (request, reply) => {
    const principal = await resolveMpPrincipal(request);
    // A phone-role user with no matching farmer/operator row has nothing to
    // delete — guard rather than silently no-op.
    if (principal.kind !== 'farmer' && principal.kind !== 'operator') {
      throw new ForbiddenError('No Dhenu account to delete');
    }
    const service = new MpAccountService(request.server.db, request.tenantId);
    await service.deleteSelf({ userId: request.user!.userId, principal });
    return reply.status(204).send();
  });
};
