import { FastifyPluginAsync } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { employees } from '@runq/db';
import { z } from 'zod';
import sharp from 'sharp';
import { rbacHook } from '../../hooks/rbac';
import { AppError, NotFoundError } from '../../utils/errors';
import { getStorageProvider } from '../../utils/storage';

/**
 * Employee profile photo endpoints. Stored on employees.photo_url as the S3
 * storage key — not via document_attachments — because there's exactly one
 * per employee and it's read on every card/row render. Image MIME types
 * only; 5 MB ceiling (photos shouldn't approach the 10 MB doc cap).
 */

const WRITE_ROLES = ['owner', 'accountant', 'hr'] as const;
const ALL_ROLES = ['owner', 'accountant', 'viewer', 'hr', 'technician'] as const;
const idParamSchema = z.object({ id: z.string().uuid() });

const PHOTO_MIMES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'] as const;
const PHOTO_MAX_BYTES = 5 * 1024 * 1024; // 5 MB ceiling on upload
const PHOTO_SIZE_PX = 512;                // final stored resolution (square)
const PHOTO_JPEG_QUALITY = 85;            // visually lossless at avatar sizes

/**
 * Decode the uploaded image, center-cover-crop to a square at PHOTO_SIZE_PX,
 * strip EXIF, JPEG-encode at quality 85. A 5 MB phone photo lands at
 * ~30–80 KB after this. Works as a safety net even when the client has
 * already cropped — re-running cover on a square no-ops, and re-encoding
 * keeps every stored photo at the same format and quality.
 */
async function optimizePhoto(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate() // honour EXIF orientation before stripping metadata
    .resize(PHOTO_SIZE_PX, PHOTO_SIZE_PX, {
      fit: 'cover',
      position: 'centre',
    })
    .jpeg({ quality: PHOTO_JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
}

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
      const rawBuffer = await file.toBuffer();
      if (rawBuffer.length > PHOTO_MAX_BYTES) {
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

      // Square-crop + downscale + re-encode before we ship it to S3. The
      // client-side crop modal already normalises framing, but running
      // sharp here also covers script uploads and out-of-bounds inputs.
      let optimized: Buffer;
      try {
        optimized = await optimizePhoto(rawBuffer);
      } catch (err: any) {
        throw new AppError(400, `Could not read image: ${err?.message ?? 'unknown'}`);
      }

      const storage = getStorageProvider();
      const storageKey = await storage.upload({
        tenantId: request.tenantId,
        entityType: 'employee_photo',
        entityId: id,
        // Force a .jpg suffix so storage providers that key off the
        // filename's extension serve the right Content-Type.
        fileName: file.filename.replace(/\.[^.]+$/, '') + '.jpg',
        mimeType: 'image/jpeg',
        data: optimized,
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
      // Optimized photos are always stored as JPEG (see optimizePhoto). The
      // browser still revalidates with no-cache on the client side, so we
      // can let it cache the response without staleness risk.
      reply
        .header('Content-Type', 'image/jpeg')
        .header('Cache-Control', 'private, max-age=300');
      return reply.send(stream);
    },
  );
};
