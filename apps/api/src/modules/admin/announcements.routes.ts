import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { announcements } from '@runq/db';
import { NotFoundError } from '../../utils/errors';
import { logPlatformAction } from './audit.service';

const upsertSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1),
  severity: z.enum(['info', 'warning', 'critical']).default('info'),
  audience: z.record(z.unknown()).default({ all: true }),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  dismissible: z.boolean().default(true),
  isActive: z.boolean().default(true),
});

export const announcementsAdminRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (request, reply) => {
    await app.authenticatePlatform(request, reply);
  });

  app.get('/announcements', async () => {
    const rows = await app.db.select().from(announcements).orderBy(desc(announcements.createdAt));
    return { data: rows };
  });

  app.post(
    '/announcements',
    { preHandler: [app.requirePlatformRole('super_admin', 'support')] },
    async (request) => {
      const input = upsertSchema.parse(request.body);
      const platformUserId = request.user.platformUserId!;
      const [created] = await app.db
        .insert(announcements)
        .values({
          ...input,
          startsAt: input.startsAt ? new Date(input.startsAt) : new Date(),
          endsAt: input.endsAt ? new Date(input.endsAt) : null,
          createdBy: platformUserId,
        })
        .returning();
      await logPlatformAction(app, request, {
        action: 'announcement.create',
        targetType: 'announcement',
        targetId: created.id,
        metadata: { title: created.title, severity: created.severity },
      });
      return { data: created };
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/announcements/:id',
    { preHandler: [app.requirePlatformRole('super_admin', 'support')] },
    async (request) => {
      const { id } = request.params;
      const input = upsertSchema.partial().parse(request.body);
      const updates: Record<string, unknown> = { ...input, updatedAt: new Date() };
      if (input.startsAt) updates.startsAt = new Date(input.startsAt);
      if (input.endsAt !== undefined) updates.endsAt = input.endsAt ? new Date(input.endsAt) : null;
      const [updated] = await app.db.update(announcements).set(updates).where(eq(announcements.id, id)).returning();
      if (!updated) throw new NotFoundError('Announcement not found');
      await logPlatformAction(app, request, {
        action: 'announcement.update',
        targetType: 'announcement',
        targetId: id,
        metadata: { changes: input },
      });
      return { data: updated };
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/announcements/:id',
    { preHandler: [app.requirePlatformRole('super_admin')] },
    async (request) => {
      const { id } = request.params;
      await app.db.delete(announcements).where(eq(announcements.id, id));
      await logPlatformAction(app, request, {
        action: 'announcement.delete',
        targetType: 'announcement',
        targetId: id,
      });
      return { data: { ok: true } };
    },
  );
};
