import { FastifyRequest, FastifyReply } from 'fastify';
import { UserRole } from '@runq/types';
import { ForbiddenError } from '../utils/errors';

/**
 * Role gate. Reads the per-tenant role resolved by `resolveTenantContext`.
 * Falls back to JWT role for routes that haven't been wired through tenant
 * context (mostly auth endpoints, which only need user identity).
 *
 * Treats `client_owner` as equivalent to `owner` for permission purposes —
 * a client tenant's owner has the same powers within their books as a
 * self-signup owner.
 */
export function rbacHook(allowedRoles: UserRole[]) {
  const expanded = expandRoles(allowedRoles);
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    const role = request.activeRole || request.user?.role;
    if (!role || !expanded.has(role)) {
      throw new ForbiddenError();
    }
  };
}

function expandRoles(roles: UserRole[]): Set<UserRole> {
  const out = new Set<UserRole>(roles);
  if (out.has('owner')) out.add('client_owner');
  return out;
}
