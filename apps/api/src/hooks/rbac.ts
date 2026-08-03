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
 *
 * Treats `field_operator` as equivalent to `viewer`. A collection-centre
 * operator is also an employee of the dairy, and `viewer` is what an ordinary
 * employee logs in as — so the operator persona should carry the same rights,
 * chiefly HR self-service (own payslips, attendance, leave). This is a widening
 * of role, not of reach: what an operator can actually touch is still bounded by
 * `roleAllowedModules('field_operator')` and the per-user module grant, so an
 * operator who hasn't been granted HR still gets a 403 from `requireModule`.
 * `viewer` is read-only everywhere except posting to HR announcements, so this
 * confers no write access beyond what an employee already has.
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
  if (out.has('viewer')) out.add('field_operator');
  return out;
}
