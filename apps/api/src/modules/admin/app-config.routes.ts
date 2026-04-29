import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { appConfig } from '@runq/db';
import { logPlatformAction } from './audit.service';

const setSchema = z.object({
  value: z.unknown(),
});

export const appConfigAdminRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (request, reply) => {
    await app.authenticatePlatform(request, reply);
  });

  app.get('/app-config', async () => {
    const rows = await app.db.select().from(appConfig).orderBy(asc(appConfig.key));
    return { data: rows };
  });

  app.put<{ Params: { key: string } }>(
    '/app-config/:key',
    { preHandler: [app.requirePlatformRole('super_admin')] },
    async (request) => {
      const { key } = request.params;
      const { value } = setSchema.parse(request.body);
      const platformUserId = request.user.platformUserId!;

      const [existing] = await app.db.select().from(appConfig).where(eq(appConfig.key, key)).limit(1);
      let result;
      if (existing) {
        [result] = await app.db
          .update(appConfig)
          .set({ value, updatedAt: new Date(), updatedBy: platformUserId })
          .where(eq(appConfig.key, key))
          .returning();
      } else {
        [result] = await app.db
          .insert(appConfig)
          .values({ key, value, updatedBy: platformUserId })
          .returning();
      }

      await logPlatformAction(app, request, {
        action: 'app_config.set',
        targetType: 'app_config',
        metadata: { key, previousValue: existing?.value, newValue: value },
      });

      // Invalidate any redis cache so the public app-config endpoint picks it up immediately.
      await app.redis.del('appcfg:public');

      return { data: result };
    },
  );
};
