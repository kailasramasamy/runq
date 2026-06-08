import { FastifyRequest, FastifyReply } from 'fastify';
import type { ModuleCode } from '@runq/types';
import { ForbiddenError } from '../utils/errors';

/**
 * Module gate. Reads `request.effectiveModules` (tenant entitlement ∩ per-user
 * grant) resolved by `resolveTenantContext` and 403s if the active user can't
 * access the module. Orthogonal to `rbacHook` — role still governs read/write
 * *within* a module the user can see; this controls whether they see it at all.
 *
 * Platform/super-admin requests carry no tenant module context, so they bypass
 * here (their access is gated by `authenticatePlatform` on the /admin scope).
 * This matches the same bypass in `resolveTenantContext`.
 */
export function requireModule(code: ModuleCode) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    if (request.user?.platformUserId && !request.user?.impersonatedBy) return;
    const modules = request.effectiveModules;
    if (!modules || !modules.includes(code)) {
      throw new ForbiddenError(`This account does not have access to the ${code} module`);
    }
  };
}
