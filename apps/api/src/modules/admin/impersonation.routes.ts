import { FastifyPluginAsync } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { tenants, users } from '@runq/db';
import { NotFoundError } from '../../utils/errors';
import { logPlatformAction } from './audit.service';

const IMPERSONATION_TTL = '30m';

export const impersonationRoutes: FastifyPluginAsync = async (app) => {
  // Issue a short-lived tenant-context JWT for the platform user to impersonate a tenant.
  app.post<{ Params: { tenantId: string } }>(
    '/tenants/:tenantId/impersonate',
    { preHandler: [app.authenticatePlatform, app.requirePlatformRole('super_admin', 'support')] },
    async (request, reply) => {
      const { tenantId } = request.params;

      const [tenant] = await app.db
        .select({ id: tenants.id, name: tenants.name, slug: tenants.slug })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);
      if (!tenant) throw new NotFoundError('Tenant not found');

      // Pick the first owner of the tenant; fall back to any active user.
      const ownerRows = await app.db
        .select()
        .from(users)
        .where(and(eq(users.tenantId, tenantId), eq(users.role, 'owner'), eq(users.isActive, true)))
        .limit(1);
      const fallbackRows = ownerRows.length
        ? ownerRows
        : await app.db
            .select()
            .from(users)
            .where(and(eq(users.tenantId, tenantId), eq(users.isActive, true)))
            .limit(1);
      const tenantUser = fallbackRows[0];

      if (!tenantUser) throw new NotFoundError('No active user found for this tenant');

      const platformUserId = request.user.platformUserId!;
      const token = app.jwt.sign(
        {
          userId: tenantUser.id,
          tenantId: tenant.id,
          role: tenantUser.role,
          impersonatedBy: platformUserId,
          platformUserId,
          platformRole: request.user.platformRole,
        },
        { expiresIn: IMPERSONATION_TTL },
      );

      await logPlatformAction(app, request, {
        action: 'tenant.impersonate.start',
        targetType: 'tenant',
        targetId: tenant.id,
        targetTenantId: tenant.id,
        metadata: { tenantName: tenant.name, tenantSlug: tenant.slug, impersonatedUserId: tenantUser.id },
      });

      return reply.send({
        data: {
          token,
          tenant,
          impersonatedUser: { id: tenantUser.id, email: tenantUser.email, name: tenantUser.name, role: tenantUser.role },
          expiresIn: IMPERSONATION_TTL,
        },
      });
    },
  );

  // Logging-only endpoint for "exit impersonation" — the client just throws away the impersonation token.
  app.post(
    '/impersonate/exit',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      if (!request.user.impersonatedBy) {
        return reply.send({ data: { ok: true } });
      }
      await logPlatformAction(app, request, {
        action: 'tenant.impersonate.exit',
        targetType: 'tenant',
        targetId: request.user.tenantId,
        targetTenantId: request.user.tenantId,
      });
      return reply.send({ data: { ok: true } });
    },
  );
};
