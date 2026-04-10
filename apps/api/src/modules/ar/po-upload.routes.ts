import { FastifyPluginAsync } from 'fastify';
import { poUploadTextSchema, uuidParamSchema } from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { getStorageProvider } from '../../utils/storage';
import { PoUploadService } from './po-upload.service';
import { AppError } from '../../utils/errors';

const WRITE_ROLES = ['owner', 'accountant'] as const;
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const ALLOWED_FILE_MIMES: ReadonlySet<string> = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'text/csv',
  'text/plain',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const ALLOWED_FILE_SOURCES: ReadonlySet<string> = new Set([
  'share_sheet',
  'web_drop',
  'web_upload',
  'paste_image',
]);

export const poUploadRoutes: FastifyPluginAsync = async (app) => {
  // POST /  — multipart file upload (PDF / image / csv / xls / text)
  // The single endpoint serves desktop drop-zone, mobile share target, and
  // paste-image — they're all the same shape: a file + a `source` form field.
  app.post(
    '/',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const file = await request.file();
      if (!file) throw new AppError(400, 'No file uploaded');

      const mimeType = file.mimetype.toLowerCase();
      if (!ALLOWED_FILE_MIMES.has(mimeType)) {
        throw new AppError(400, `File type '${mimeType}' is not supported.`);
      }

      const buffer = await file.toBuffer();
      if (buffer.length > MAX_FILE_SIZE) {
        throw new AppError(400, 'File exceeds 10 MB limit');
      }

      // `request.file()` consumed the file part — remaining fields are on file.fields.
      const sourceField = file.fields.source as { value?: string } | undefined;
      const sourceValue = sourceField?.value ?? 'web_upload';
      if (!ALLOWED_FILE_SOURCES.has(sourceValue)) {
        throw new AppError(400, `Invalid source '${sourceValue}' for file upload`);
      }

      const metadataField = file.fields.sourceMetadata as { value?: string } | undefined;
      let sourceMetadata: Record<string, unknown> | null = null;
      if (metadataField?.value) {
        try {
          sourceMetadata = JSON.parse(metadataField.value);
        } catch {
          throw new AppError(400, 'sourceMetadata must be valid JSON');
        }
      }

      const service = new PoUploadService(
        request.server.db,
        request.tenantId,
        getStorageProvider(),
      );

      const row = await service.createFromFile({
        buffer,
        fileName: file.filename,
        mimeType,
        source: sourceValue as 'share_sheet' | 'web_drop' | 'web_upload' | 'paste_image',
        sourceMetadata,
        uploadedBy: request.user!.userId,
      });

      return reply.status(201).send({ data: row });
    },
  );

  // POST /text — JSON body for pasted free-text POs
  app.post(
    '/text',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const input = poUploadTextSchema.parse(request.body);

      const service = new PoUploadService(
        request.server.db,
        request.tenantId,
        getStorageProvider(),
      );

      const row = await service.createFromText({
        text: input.text,
        source: input.source,
        sourceMetadata: input.sourceMetadata ?? null,
        uploadedBy: request.user!.userId,
      });

      return reply.status(201).send({ data: row });
    },
  );

  // GET /:id — single upload row
  app.get(
    '/:id',
    { preHandler: [rbacHook(['owner', 'accountant', 'viewer'])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new PoUploadService(
        request.server.db,
        request.tenantId,
        getStorageProvider(),
      );
      const row = await service.getById(id);
      return { data: row };
    },
  );

  // GET /:id/file — stream the source file for the review screen's inline
  // preview. Mirrors common/attachments/:id/download for headers + auth.
  app.get(
    '/:id/file',
    { preHandler: [rbacHook(['owner', 'accountant', 'viewer'])] },
    async (request, reply) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new PoUploadService(
        request.server.db,
        request.tenantId,
        getStorageProvider(),
      );
      const file = await service.getFileStream(id);

      reply
        .header('Content-Type', file.mimeType)
        .header('Content-Disposition', `inline; filename="${file.fileName}"`);
      if (file.fileSize != null) {
        reply.header('Content-Length', file.fileSize);
      }
      return reply.send(file.stream);
    },
  );

  // POST /:id/reparse — re-run the parser on an existing upload (drops the
  // existing draft + lines, resets status, fires the parser in background).
  app.post(
    '/:id/reparse',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new PoUploadService(
        request.server.db,
        request.tenantId,
        getStorageProvider(),
      );
      const row = await service.reparse(id);
      return { data: row };
    },
  );

  // DELETE /:id — discard a PO upload (sets status='discarded', drops
  // draft + lines, deletes S3 file). Allows re-uploading the same file.
  app.delete(
    '/:id',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new PoUploadService(
        request.server.db,
        request.tenantId,
        getStorageProvider(),
      );
      await service.discard(id);
      return reply.status(204).send();
    },
  );
};
