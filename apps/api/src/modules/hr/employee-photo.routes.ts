import { FastifyPluginAsync } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { employees } from '@runq/db';
import { z } from 'zod';
import { rbacHook } from '../../hooks/rbac';
import { AppError, NotFoundError } from '../../utils/errors';
import { getStorageProvider } from '../../utils/storage';

/**
 * Employee profile photo endpoints. Stored on employees.photo_url as the S3
 * storage key — not via document_attachments — because there's exactly one
 * per employee and it's read on every card/row render. Image MIME types
 * only; 5 MB ceiling (photos shouldn't approach the 10 MB doc cap).
 */

const WRITE_ROLES = ['owner', 'accountant'] as const;
const ALL_ROLES = ['owner', 'accountant', 'viewer'] as const;
const idParamSchema = z.object({ id: z.string().uuid() });

const PHOTO_MIMES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'] as const;
const PHOTO_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export const employeePhotoRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/employees/:id/photo',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { id } = idParamSchema.parse(request.params);
      const file = await request.file();
      if (!file) throw new AppError(400, 'No file uploaded');

      if (!PHOTO_MIMES.includes(file.mimetype as any)) {
        throw new AppError(400, `Photo must be PNG, JPG, or WEBP (got ${file.mimetype})`);
      }
      const buffer = await file.toBuffer();
      if (buffer.length > PHOTO_MAX_BYTES) {
        throw new AppError(400, 'Photo exceeds 5 MB limit');
      }

      // Make sure the employee exists & belongs to this tenant before we
      // burn bytes on S3 — and capture the previous key so we can clean up.
      const [emp] = await request.server.db
        .select({ id: employees.id, photoUrl: employees.photoUrl })
        .from(employees)
        .where(and(eq(employees.id, id), eq(employees.tenantId, request.tenantId)))
        .limit(1);
      if (!emp) throw new NotFoundError('Employee');

      const storage = getStorageProvider();
      const storageKey = await storage.upload({
        tenantId: request.tenantId,
        entityType: 'employee_photo',
        entityId: id,
        fileName: file.filename,
        mimeType: file.mimetype,
        data: buffer,
      });

      await request.server.db
        .update(employees)
        .set({ photoUrl: storageKey, updatedAt: new Date() })
        .where(and(eq(employees.id, id), eq(employees.tenantId, request.tenantId)));

      // Best-effort cleanup of the previous photo. Swallow failures — the
      // new key is already saved; an orphaned blob is cheap.
      if (emp.photoUrl && emp.photoUrl !== storageKey) {
        storage.delete(emp.photoUrl).catch(() => {});
      }

      reply.code(201);
      return { data: { storageKey } };
    },
  );

  app.delete(
    '/employees/:id/photo',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = idParamSchema.parse(request.params);
      const [emp] = await request.server.db
        .select({ id: employees.id, photoUrl: employees.photoUrl })
        .from(employees)
        .where(and(eq(employees.id, id), eq(employees.tenantId, request.tenantId)))
        .limit(1);
      if (!emp) throw new NotFoundError('Employee');
      if (!emp.photoUrl) return { data: null };

      await request.server.db
        .update(employees)
        .set({ photoUrl: null, updatedAt: new Date() })
        .where(and(eq(employees.id, id), eq(employees.tenantId, request.tenantId)));

      // Same swallow-on-failure rationale as upload — DB is the source of
      // truth; a leftover S3 blob doesn't break anything.
      getStorageProvider().delete(emp.photoUrl).catch(() => {});

      return { data: null };
    },
  );

  app.get(
    '/employees/:id/photo',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request, reply) => {
      const { id } = idParamSchema.parse(request.params);
      const [emp] = await request.server.db
        .select({ photoUrl: employees.photoUrl })
        .from(employees)
        .where(and(eq(employees.id, id), eq(employees.tenantId, request.tenantId)))
        .limit(1);
      if (!emp || !emp.photoUrl) throw new NotFoundError('Photo');

      const stream = await getStorageProvider().getStream(emp.photoUrl);
      // Browser caches the photo for 5 minutes per session — short enough
      // that a fresh upload shows up quickly, long enough to avoid re-fetch
      // on every list render.
      reply.header('Cache-Control', 'private, max-age=300');
      return reply.send(stream);
    },
  );
};
