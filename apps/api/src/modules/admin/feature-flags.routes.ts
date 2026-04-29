import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { asc, eq, and } from 'drizzle-orm';
import { featureFlags, tenantFeatureFlags } from '@runq/db';
import { NotFoundError } from '../../utils/errors';
import { logPlatformAction } from './audit.service';

const flagUpsertSchema = z.object({
  key: z.string().min(2).max(80).regex(/^[a-z0-9_.-]+$/i),
  name: z.string().min(1).max(160),
  description: z.string().nullable().optional(),
  defaultEnabled: z.boolean().default(false),
  rolloutPercentage: z.number().int().min(0).max(100).default(0),
});

const overrideSchema = z.object({
  enabled: z.boolean(),
  overrideReason: z.string().nullable().optional(),
});

export const featureFlagsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (request, reply) => {
    await app.authenticatePlatform(request, reply);
  });

  app.get('/feature-flags', async () => {
    const flags = await app.db.select().from(featureFlags).orderBy(asc(featureFlags.key));
    return { data: flags };
  });

  app.post(
    '/feature-flags',
    { preHandler: [app.requirePlatformRole('super_admin')] },
    async (request) => {
      const input = flagUpsertSchema.parse(request.body);
      const [created] = await app.db.insert(featureFlags).values(input).returning();
      await logPlatformAction(app, request, {
        action: 'feature_flag.create',
        targetType: 'feature_flag',
        targetId: created.id,
        metadata: { key: created.key },
      });
      return { data: created };
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/feature-flags/:id',
    { preHandler: [app.requirePlatformRole('super_admin')] },
    async (request) => {
      const { id } = request.params;
      const input = flagUpsertSchema.partial().parse(request.body);
      const [updated] = await app.db
        .update(featureFlags)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(featureFlags.id, id))
        .returning();
      if (!updated) throw new NotFoundError('Feature flag not found');
      await logPlatformAction(app, request, {
        action: 'feature_flag.update',
        targetType: 'feature_flag',
        targetId: id,
        metadata: { changes: input },
      });
      return { data: updated };
    },
  );

  // Per-tenant override list & set.
  app.get<{ Params: { flagKey: string } }>('/feature-flags/:flagKey/overrides', async (request) => {
    const { flagKey } = request.params;
    const rows = await app.db
      .select()
      .from(tenantFeatureFlags)
      .where(eq(tenantFeatureFlags.flagKey, flagKey));
    return { data: rows };
  });

  app.put<{ Params: { flagKey: string; tenantId: string } }>(
    '/feature-flags/:flagKey/overrides/:tenantId',
    { preHandler: [app.requirePlatformRole('super_admin', 'support')] },
    async (request) => {
      const { flagKey, tenantId } = request.params;
      const input = overrideSchema.parse(request.body);

      const [existing] = await app.db
        .select()
        .from(tenantFeatureFlags)
        .where(and(eq(tenantFeatureFlags.tenantId, tenantId), eq(tenantFeatureFlags.flagKey, flagKey)))
        .limit(1);

      let result;
      if (existing) {
        [result] = await app.db
          .update(tenantFeatureFlags)
          .set({ enabled: input.enabled, overrideReason: input.overrideReason ?? null, updatedAt: new Date() })
          .where(eq(tenantFeatureFlags.id, existing.id))
          .returning();
      } else {
        [result] = await app.db
          .insert(tenantFeatureFlags)
          .values({ tenantId, flagKey, enabled: input.enabled, overrideReason: input.overrideReason ?? null })
          .returning();
      }

      await logPlatformAction(app, request, {
        action: 'feature_flag.override',
        targetType: 'feature_flag',
        targetTenantId: tenantId,
        metadata: { flagKey, enabled: input.enabled, reason: input.overrideReason },
      });

      return { data: result };
    },
  );

  app.delete<{ Params: { flagKey: string; tenantId: string } }>(
    '/feature-flags/:flagKey/overrides/:tenantId',
    { preHandler: [app.requirePlatformRole('super_admin', 'support')] },
    async (request) => {
      const { flagKey, tenantId } = request.params;
      await app.db
        .delete(tenantFeatureFlags)
        .where(and(eq(tenantFeatureFlags.tenantId, tenantId), eq(tenantFeatureFlags.flagKey, flagKey)));
      await logPlatformAction(app, request, {
        action: 'feature_flag.override.remove',
        targetType: 'feature_flag',
        targetTenantId: tenantId,
        metadata: { flagKey },
      });
      return { data: { ok: true } };
    },
  );
};
