import { FastifyPluginAsync } from 'fastify';
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { hrAnnouncements, users } from '@runq/db';
import { rbacHook } from '../../hooks/rbac';

// Anyone in the HR module can read announcements; only owners post or delete.
// We keep this scoped narrowly — there's no "edit" endpoint by design,
// since announcements are short-lived; admins delete and repost if needed.
const READ_ROLES = ['owner', 'accountant', 'viewer', 'hr'] as const;
// HR can also post announcements (People Ops use case).
const WRITE_ROLES = ['owner', 'hr'] as const;

const createSchema = z.object({
  title: z.string().min(2).max(140),
  body: z.string().min(2).max(4000),
  audience: z.enum(['all', 'managers']).default('all'),
  pinned: z.boolean().default(false),
  // ISO string; null/undefined → never expires.
  expiresAt: z.string().datetime().nullable().optional(),
});

const uuidParam = z.object({ id: z.string().uuid() });

export const hrAnnouncementRoutes: FastifyPluginAsync = async (app) => {
  /// Active announcements for the manager dashboard. Pinned first, then
  /// most-recent. Expired rows are filtered out at query time. Capped at 20
  /// to keep the feed digestible.
  app.get(
    '/announcements',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (req) => {
      const nowSql = sql`NOW()`;
      const rows = await req.server.db
        .select({
          id: hrAnnouncements.id,
          title: hrAnnouncements.title,
          body: hrAnnouncements.body,
          audience: hrAnnouncements.audience,
          pinned: hrAnnouncements.pinned,
          postedAt: hrAnnouncements.postedAt,
          expiresAt: hrAnnouncements.expiresAt,
          postedById: hrAnnouncements.postedById,
          postedByName: users.name,
        })
        .from(hrAnnouncements)
        .leftJoin(users, eq(users.id, hrAnnouncements.postedById))
        .where(
          and(
            eq(hrAnnouncements.tenantId, req.tenantId),
            or(
              isNull(hrAnnouncements.expiresAt),
              sql`${hrAnnouncements.expiresAt} > ${nowSql}`,
            ),
          ),
        )
        .orderBy(desc(hrAnnouncements.pinned), desc(hrAnnouncements.postedAt))
        .limit(20);
      return { data: rows };
    },
  );

  app.post(
    '/announcements',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (req, reply) => {
      const body = createSchema.parse(req.body);
      const [row] = await req.server.db
        .insert(hrAnnouncements)
        .values({
          tenantId: req.tenantId,
          title: body.title,
          body: body.body,
          audience: body.audience,
          pinned: body.pinned,
          postedById: req.user!.userId,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        })
        .returning();
      return reply.status(201).send({ data: row });
    },
  );

  app.delete(
    '/announcements/:id',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (req, reply) => {
      const { id } = uuidParam.parse(req.params);
      const result = await req.server.db
        .delete(hrAnnouncements)
        .where(
          and(eq(hrAnnouncements.id, id), eq(hrAnnouncements.tenantId, req.tenantId)),
        )
        .returning({ id: hrAnnouncements.id });
      if (result.length === 0) {
        return reply.status(404).send({ message: 'Announcement not found' });
      }
      return reply.status(204).send();
    },
  );
};
