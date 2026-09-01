import fp from 'fastify-plugin';
import { FastifyInstance, FastifyRequest } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { userTenants, tenants } from '@runq/db';
import type { UserRole, ModuleCode } from '@runq/types';
import { sanitizeModuleCodes, defaultModulesForRole, roleAllowedModules, withHrFloor } from '@runq/types';
import { ForbiddenError } from '../utils/errors';

declare module 'fastify' {
  interface FastifyRequest {
    tenantId: string;
    // Per-tenant role for the active request. Differs from `request.user.role`,
    // which is the user's role in their HOME tenant (baked into the JWT).
    // Under multi-tenant, the active role can be different in each client tenant.
    activeRole: UserRole;
    // Modules this user can access in the active tenant: the tenant's enabled
    // ceiling intersected with the user's per-membership grant. Empty for
    // platform users (who bypass tenant resolution). Drives `requireModule`.
    effectiveModules: ModuleCode[];
  }
  interface FastifyInstance {
    resolveTenantContext: (request: FastifyRequest) => Promise<void>;
  }
}

const TENANT_HEADER = 'x-tenant-id';

export interface Membership {
  tenantId: string;
  role: UserRole;
  userModules: string[] | null;
  enabledModules: string[];
}

/**
 * Effective module access:
 *   - owner/client_owner → all enabled (never lock the owner out)
 *   - no explicit grant (null) → role-based default (accountant→finance+HR,
 *     field_operator→milk+HR, viewer→HR)
 *   - explicit grant → enabled ∩ grant, bounded by what the role may access
 *     (so a granted module never 403s its own data)
 *   - …then the HR floor is unioned in for every employee role, because HR
 *     self-service is not a grantable privilege. This is what lets a stored
 *     grant that omits `hr` (every operator row written before the floor
 *     existed) resolve correctly with no data backfill.
 */
export function computeEffectiveModules(m: Membership): ModuleCode[] {
  const enabled = sanitizeModuleCodes(m.enabledModules ?? []);
  if (m.role === 'owner' || m.role === 'client_owner') return enabled;
  if (m.userModules == null) return defaultModulesForRole(m.role, enabled);
  const allowed = new Set(roleAllowedModules(m.role, enabled));
  const granted = new Set(sanitizeModuleCodes(m.userModules));
  return withHrFloor(m.role, enabled, enabled.filter((code) => allowed.has(code) && granted.has(code)));
}

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
  // null-slot: populated per-request by resolveTenantContext. Stays empty for
  // platform users, who never carry tenant-scoped module access. Fastify v5
  // forbids reference-type decorator defaults, so initialise to null (the slot
  // is always assigned an array before any module guard reads it).
  app.decorateRequest('effectiveModules', null as unknown as ModuleCode[]);

  // Single membership lookup, joined to the tenant for its module ceiling.
  const loadMembership = async (userId: string, tenantId: string): Promise<Membership | undefined> => {
    const [row] = await app.db
      .select({
        tenantId: userTenants.tenantId,
        role: userTenants.role,
        userModules: userTenants.modules,
        enabledModules: tenants.enabledModules,
      })
      .from(userTenants)
      .innerJoin(tenants, eq(tenants.id, userTenants.tenantId))
      .where(and(eq(userTenants.userId, userId), eq(userTenants.tenantId, tenantId)))
      .limit(1);
    return row;
  };

  const applyMembership = (request: FastifyRequest, m: Membership) => {
    request.tenantId = m.tenantId;
    request.activeRole = m.role;
    request.effectiveModules = computeEffectiveModules(m);
  };

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
      const membership = await loadMembership(userId, requestedTenantId);
      if (membership) {
        applyMembership(request, membership);
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
      const membership = await loadMembership(userId, request.user.tenantId);
      if (membership) {
        applyMembership(request, membership);
        return;
      }
      // No membership for the JWT's tenantId — reject explicitly. This
      // shouldn't happen for any user post-Phase-1 backfill; if it does, the
      // user's session is genuinely stale (tenant deleted, member removed).
      throw new ForbiddenError('No tenant membership for this session');
    }
  });
});
