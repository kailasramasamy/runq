import { FastifyRequest, FastifyReply } from 'fastify';
import { UserRole } from '@runq/types';
import { ForbiddenError } from '../utils/errors';

export function rbacHook(allowedRoles: UserRole[]) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    const userRole = request.user?.role;
    if (!userRole || !allowedRoles.includes(userRole)) {
      throw new ForbiddenError();
    }
  };
}
