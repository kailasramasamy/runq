import { FastifyPluginAsync } from 'fastify';
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import sharp from 'sharp';
import { hrAnnouncements, users, employees, departments } from '@runq/db';
import { rbacHook } from '../../hooks/rbac';
import { AppError, NotFoundError } from '../../utils/errors';
import { getStorageProvider } from '../../utils/storage';
import { HrNotifier } from './hr-notifier';
import { employeeMatchesUser, isSelfServiceRole } from './access-scope';

/// The caller's department, or null when no employee row backs this user.
/// Matches on email OR phone via [employeeMatchesUser]: a mobile OTP login
/// has a synthesised `phone-…@runq.local` address, so an email-only join
/// silently returns nothing and strands every phone-registered employee.
async function callerDepartmentId(req: {
  server: { db: any }; tenantId: string; user: { userId: string } | undefined;
}): Promise<string | null> {
  const [userRow] = await req.server.db
    .select({ email: users.email, phone: users.phone })
    .from(users)
    .where(eq(users.id, req.user!.userId))
    .limit(1);
  if (!userRow) return null;
  const [emp] = await req.server.db
    .select({ deptId: employees.departmentId })
    .from(employees)
    .where(employeeMatchesUser(req.tenantId, userRow))
    .limit(1);
  return emp?.deptId ?? null;
}

// Anyone in the HR module can read announcements.
const READ_ROLES = ['owner', 'accountant', 'viewer', 'hr', 'technician'] as const;
// Owner + accountant + HR have org-wide write. Viewers (employees / line
// managers) are allowed at the route level but the handler narrows them
// further: only managers (subset scope) can post, and only into their own
// department. Plain self-scope employees are rejected.
const POST_ROLES = ['owner', 'accountant', 'hr', 'viewer', 'technician'] as const;

const ANNOUNCEMENT_CATEGORIES = [
  'general', 'policy', 'holiday', 'event',
  'operational', 'celebration', 'payroll',
] as const;

const createSchema = z.object({
  title: z.string().min(2).max(140),
  body: z.string().min(2).max(4000),
  audience: z.enum(['all', 'managers']).default('all'),
  category: z.enum(ANNOUNCEMENT_CATEGORIES).default('general'),
  /// Optional dept scope. Omit / null = org-wide.
  departmentId: z.string().uuid().nullable().optional(),
  pinned: z.boolean().default(false),
  // ISO string; null/undefined → never expires.
  expiresAt: z.string().datetime().nullable().optional(),
});

// Update is partial — every field optional. Only the keys present in
// the body get written; everything else is left alone (preserves the
// row's id, postedAt, posted_by_id so analytics + audit stay intact).
const updateSchema = z.object({
  title: z.string().min(2).max(140).optional(),
  body: z.string().min(2).max(4000).optional(),
  audience: z.enum(['all', 'managers']).optional(),
  category: z.enum(ANNOUNCEMENT_CATEGORIES).optional(),
  departmentId: z.string().uuid().nullable().optional(),
  pinned: z.boolean().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

const uuidParam = z.object({ id: z.string().uuid() });

// Image upload constants — same shape as employee-photo. Resized down
// from raw camera frames so the feed thumbnail is snappy and the full
// view stays sharp without burning bandwidth.
const IMG_MIMES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'] as const;
const IMG_MAX_BYTES = 5 * 1024 * 1024;
const IMG_MAX_W = 1600;          // wide enough for a landscape poster
const IMG_JPEG_QUALITY = 82;

async function optimizeImage(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .resize({ width: IMG_MAX_W, withoutEnlargement: true })
    .jpeg({ quality: IMG_JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
}

export const hrAnnouncementRoutes: FastifyPluginAsync = async (app) => {
  /// Active announcements visible to the caller. Pinned first, then
  /// newest, capped at 20. Visibility = unexpired AND (org-wide OR
  /// caller's department). The caller's dept is resolved via the same
  /// email-match pattern /hr/me uses; for org-wide users (admin / HR
  /// without an employee row) the dept filter falls back to "show all
  /// dept-targeted rows" since they need to see everything anyway.
  app.get(
    '/announcements',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (req) => {
      const nowSql = sql`NOW()`;

      // Resolve caller's department (NULL for admins without an emp row).
      const callerDeptId = await callerDepartmentId(req);
      const isOrgWideViewer = ['owner', 'accountant', 'hr', 'client_owner']
        .includes(req.activeRole);

      const rows = await req.server.db
        .select({
          id: hrAnnouncements.id,
          title: hrAnnouncements.title,
          body: hrAnnouncements.body,
          audience: hrAnnouncements.audience,
          category: hrAnnouncements.category,
          departmentId: hrAnnouncements.departmentId,
          departmentName: departments.name,
          imageKey: hrAnnouncements.imageKey,
          pinned: hrAnnouncements.pinned,
          postedAt: hrAnnouncements.postedAt,
          expiresAt: hrAnnouncements.expiresAt,
          postedById: hrAnnouncements.postedById,
          postedByName: users.name,
        })
        .from(hrAnnouncements)
        .leftJoin(users, eq(users.id, hrAnnouncements.postedById))
        .leftJoin(departments, eq(departments.id, hrAnnouncements.departmentId))
        .where(
          and(
            eq(hrAnnouncements.tenantId, req.tenantId),
            or(
              isNull(hrAnnouncements.expiresAt),
              sql`${hrAnnouncements.expiresAt} > ${nowSql}`,
            ),
            // Dept visibility. Admins / HR see everything.
            isOrgWideViewer
              ? undefined
              : or(
                  isNull(hrAnnouncements.departmentId),
                  callerDeptId
                    ? eq(hrAnnouncements.departmentId, callerDeptId)
                    : sql`false`,
                ),
          ),
        )
        .orderBy(desc(hrAnnouncements.pinned), desc(hrAnnouncements.postedAt))
        .limit(20);

      // Convert image_key → API URL the client can hit directly.
      // Streamed via /hr/announcements/:id/image (presigned per request
      // by the storage layer; signed URL avoids exposing S3 keys).
      const data = rows.map((r) => ({
        ...r,
        imageUrl: r.imageKey ? `/api/v1/hr/announcements/${r.id}/image` : null,
      }));
      return { data };
    },
  );

  app.post(
    '/announcements',
    { preHandler: [rbacHook([...POST_ROLES])] },
    async (req, reply) => {
      const body = createSchema.parse(req.body);

      // Manager gating. Owner / HR fall through with no restrictions —
      // they can target any department, any audience. For viewers we
      // resolve the caller's employee row, require they're a manager
      // (i.e. their dept exists), and force the post into that dept
      // regardless of what the client tried to set. Audience also
      // collapses to 'all' — managers shouldn't push managers-only
      // posts to the company.
      let dept = body.departmentId ?? null;
      let audience = body.audience;
      if (isSelfServiceRole(req.activeRole)) {
        const myDeptId = await callerDepartmentId(req);
        if (!myDeptId) {
          return reply.status(403).send({
            message: 'Only managers in a department can post announcements',
          });
        }
        dept = myDeptId;
        audience = 'all';
        // Policy is HR's lane — line managers can pick any other tag.
        if (body.category === 'policy') {
          return reply.status(403).send({
            message: 'Only HR / owners can post policy announcements',
          });
        }
      }

      const [row] = await req.server.db
        .insert(hrAnnouncements)
        .values({
          tenantId: req.tenantId,
          title: body.title,
          body: body.body,
          audience,
          category: body.category,
          departmentId: dept,
          pinned: body.pinned,
          postedById: req.user!.userId,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        })
        .returning();

      new HrNotifier(req.server.db, req.tenantId)
        .notifyAudience(
          { departmentId: dept ?? null, audience },
          {
            type: body.pinned ? 'warn' : 'info',
            source: 'hr_announcement',
            title: `📢 ${body.title}`,
            body: body.body.slice(0, 140),
            targetUrl: '/hr/announcements',
          },
          req.user!.userId,
        )
        .catch((e) => req.log.error(e, 'Announcement notification failed'));

      return reply.status(201).send({ data: row });
    },
  );

  // Partial in-place edit. The original module shipped without this
  // (delete + repost was the design) — added once HR users started
  // typo-fixing pinned posts and losing the post timestamp + audit
  // metadata each time. Image swap stays on the dedicated /image
  // route; this only touches text / scope / lifecycle fields.
  app.put(
    '/announcements/:id',
    { preHandler: [rbacHook([...POST_ROLES])] },
    async (req, reply) => {
      const { id } = uuidParam.parse(req.params);
      const input = updateSchema.parse(req.body);
      // Load existing row to enforce ownership for viewers (a manager
      // can only edit posts they themselves wrote — they're not
      // allowed to silently moderate HR's posts) AND so we can keep
      // dept / audience locked for viewer-edits the same way the
      // create handler does.
      const [existing] = await req.server.db
        .select({ postedById: hrAnnouncements.postedById })
        .from(hrAnnouncements)
        .where(and(eq(hrAnnouncements.id, id), eq(hrAnnouncements.tenantId, req.tenantId)))
        .limit(1);
      if (!existing) {
        return reply.status(404).send({ message: 'Announcement not found' });
      }
      if (isSelfServiceRole(req.activeRole)) {
        if (existing.postedById !== req.user!.userId) {
          return reply.status(403).send({ message: 'You can only edit your own posts' });
        }
        // Strip fields managers aren't allowed to change here.
        delete (input as { departmentId?: unknown }).departmentId;
        delete (input as { audience?: unknown }).audience;
        if (input.category === 'policy') {
          return reply.status(403).send({
            message: 'Only HR / owners can post policy announcements',
          });
        }
      }
      // Drop undefined fields so a partial update only writes what
      // was sent. departmentId / expiresAt explicitly accept null →
      // clear-out semantics.
      const set: Record<string, unknown> = {};
      if (input.title !== undefined) set.title = input.title;
      if (input.body !== undefined) set.body = input.body;
      if (input.audience !== undefined) set.audience = input.audience;
      if (input.category !== undefined) set.category = input.category;
      if (input.departmentId !== undefined) set.departmentId = input.departmentId;
      if (input.pinned !== undefined) set.pinned = input.pinned;
      if (input.expiresAt !== undefined) {
        set.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
      }
      if (Object.keys(set).length === 0) {
        return reply.status(400).send({ message: 'No fields to update' });
      }
      const [row] = await req.server.db
        .update(hrAnnouncements)
        .set(set)
        .where(and(eq(hrAnnouncements.id, id), eq(hrAnnouncements.tenantId, req.tenantId)))
        .returning();
      if (!row) {
        return reply.status(404).send({ message: 'Announcement not found' });
      }
      return { data: row };
    },
  );

  app.delete(
    '/announcements/:id',
    { preHandler: [rbacHook([...POST_ROLES])] },
    async (req, reply) => {
      const { id } = uuidParam.parse(req.params);
      // Capture image key + author before we delete the row so we can
      // clean up the S3 blob and enforce manager ownership.
      const [existing] = await req.server.db
        .select({ imageKey: hrAnnouncements.imageKey, postedById: hrAnnouncements.postedById })
        .from(hrAnnouncements)
        .where(and(eq(hrAnnouncements.id, id), eq(hrAnnouncements.tenantId, req.tenantId)))
        .limit(1);
      if (!existing) {
        return reply.status(404).send({ message: 'Announcement not found' });
      }
      if (isSelfServiceRole(req.activeRole) && existing.postedById !== req.user!.userId) {
        return reply.status(403).send({ message: 'You can only delete your own posts' });
      }
      await req.server.db
        .delete(hrAnnouncements)
        .where(and(eq(hrAnnouncements.id, id), eq(hrAnnouncements.tenantId, req.tenantId)));
      if (existing.imageKey) {
        getStorageProvider().delete(existing.imageKey).catch(() => {});
      }
      return reply.status(204).send();
    },
  );

  // Image upload — mirrors employee-photo route. POST multipart, the
  // server resizes + JPEG-encodes, stores the key on the row. One
  // image per announcement; re-posting replaces (old key cleaned up).
  app.post(
    '/announcements/:id/image',
    { preHandler: [rbacHook([...POST_ROLES])] },
    async (req, reply) => {
      const { id } = uuidParam.parse(req.params);
      const file = await req.file();
      if (!file) throw new AppError(400, 'No file uploaded');
      if (!IMG_MIMES.includes(file.mimetype as any)) {
        throw new AppError(400, `Image must be PNG, JPG, or WEBP (got ${file.mimetype})`);
      }
      const raw = await file.toBuffer();
      if (raw.length > IMG_MAX_BYTES) {
        throw new AppError(400, 'Image exceeds 5 MB limit');
      }

      const [row] = await req.server.db
        .select({
          id: hrAnnouncements.id,
          imageKey: hrAnnouncements.imageKey,
          postedById: hrAnnouncements.postedById,
        })
        .from(hrAnnouncements)
        .where(and(eq(hrAnnouncements.id, id), eq(hrAnnouncements.tenantId, req.tenantId)))
        .limit(1);
      if (!row) throw new NotFoundError('Announcement');
      // Managers can only attach images to posts they own.
      if (isSelfServiceRole(req.activeRole) && row.postedById !== req.user!.userId) {
        throw new AppError(403, 'You can only attach images to your own posts');
      }

      let optimized: Buffer;
      try {
        optimized = await optimizeImage(raw);
      } catch (err: any) {
        throw new AppError(400, `Could not read image: ${err?.message ?? 'unknown'}`);
      }

      const storage = getStorageProvider();
      const storageKey = await storage.upload({
        tenantId: req.tenantId,
        entityType: 'announcement_image',
        entityId: id,
        fileName: file.filename.replace(/\.[^.]+$/, '') + '.jpg',
        mimeType: 'image/jpeg',
        data: optimized,
      });

      await req.server.db
        .update(hrAnnouncements)
        .set({ imageKey: storageKey })
        .where(and(eq(hrAnnouncements.id, id), eq(hrAnnouncements.tenantId, req.tenantId)));

      if (row.imageKey && row.imageKey !== storageKey) {
        storage.delete(row.imageKey).catch(() => {});
      }

      reply.code(201);
      return { data: { storageKey } };
    },
  );

  // Stream the cover image. Open to readers — visibility is implicit
  // (you can't get the ID without seeing the announcement in the feed).
  app.get(
    '/announcements/:id/image',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (req, reply) => {
      const { id } = uuidParam.parse(req.params);
      const [row] = await req.server.db
        .select({ imageKey: hrAnnouncements.imageKey })
        .from(hrAnnouncements)
        .where(and(eq(hrAnnouncements.id, id), eq(hrAnnouncements.tenantId, req.tenantId)))
        .limit(1);
      if (!row || !row.imageKey) throw new NotFoundError('Image');
      const stream = await getStorageProvider().getStream(row.imageKey);
      reply
        .header('Content-Type', 'image/jpeg')
        .header('Cache-Control', 'private, max-age=300');
      return reply.send(stream);
    },
  );
};
