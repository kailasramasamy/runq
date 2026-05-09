import fp from 'fastify-plugin';
import { FastifyInstance, FastifyRequest } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { userTenants } from '@runq/db';
import type { UserRole } from '@runq/types';
import { ForbiddenError } from '../utils/errors';

declare module 'fastify' {
  interface FastifyRequest {
    tenantId: string;
    // Per-tenant role for the active request. Differs from `request.user.role`,
    // which is the user's role in their HOME tenant (baked into the JWT).
    // Under multi-tenant, the active role can be different in each client tenant.
    activeRole: UserRole;
  }
  interface FastifyInstance {
    resolveTenantContext: (request: FastifyRequest) => Promise<void>;
  }
}

const TENANT_HEADER = 'x-tenant-id';

/**
 * Resolves the active tenant for an authenticated request:
 *   1. If `X-Tenant-Id` header is set AND user is a member of that tenant, use it.
 *   2. Otherwise fall back to `request.user.tenantId` from JWT (legacy tokens).
 *
 * Exposed as `app.resolveTenantContext(request)`. Must be called AFTER
 * authenticate has populated `request.user`. Wire it as a `preHandler`
 * inside scopes that pre-attach `authenticate` as `onRequest`, or include
 * it explicitly in route-level preHandler arrays alongside `app.authenticate`.
 */
export const tenantContextPlugin = fp(async (app: FastifyInstance) => {
  app.decorateRequest('tenantId', '');
  app.decorateRequest('activeRole', 'viewer' as UserRole);

  app.decorate('resolveTenantContext', async (request: FastifyRequest) => {
    // Platform users (super-admin) bypass tenant resolution.
    if (request.user?.platformUserId && !request.user?.impersonatedBy) {
      return;
    }

    const userId = request.user?.userId;
    if (!userId) return;

    const headerValue = request.headers[TENANT_HEADER];
    const requestedTenantId = Array.isArray(headerValue) ? headerValue[0] : headerValue;

    if (requestedTenantId) {
      const [membership] = await app.db
        .select({ tenantId: userTenants.tenantId, role: userTenants.role })
        .from(userTenants)
        .where(and(eq(userTenants.userId, userId), eq(userTenants.tenantId, requestedTenantId)))
        .limit(1);

      if (membership) {
        request.tenantId = membership.tenantId;
        request.activeRole = membership.role;
        return;
      }
      // Header sent but user is NOT a member of that tenant: forged or stale.
      // Reject explicitly rather than silently using JWT — preserves the
      // multi-tenant security boundary.
      throw new ForbiddenError('Not a member of the requested tenant');
    }

    // No header: resolve from JWT (legacy tokens / first request after login)
    // and look up the active role from user_tenants. The JWT's `role` field is
    // never trusted as a security input — only user_tenants membership rows
    // determine permissions in a tenant.
    if (request.user?.tenantId) {
      const [membership] = await app.db
        .select({ tenantId: userTenants.tenantId, role: userTenants.role })
        .from(userTenants)
        .where(and(eq(userTenants.userId, userId), eq(userTenants.tenantId, request.user.tenantId)))
        .limit(1);
      if (membership) {
        request.tenantId = membership.tenantId;
        request.activeRole = membership.role;
        return;
      }
      // No membership for the JWT's tenantId — reject explicitly. This
      // shouldn't happen for any user post-Phase-1 backfill; if it does, the
      // user's session is genuinely stale (tenant deleted, member removed).
      throw new ForbiddenError('No tenant membership for this session');
    }
  });
});
