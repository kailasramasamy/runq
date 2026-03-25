import { FastifyPluginAsync } from 'fastify';
import { attachmentParamsSchema, attachmentIdSchema, ALLOWED_MIME_TYPES } from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { AttachmentService } from './attachment.service';
import { getStorageProvider } from '../../utils/storage';
import { AppError } from '../../utils/errors';

const ALL_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;

export const attachmentRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/attachments/:entityType/:entityId',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const params = attachmentParamsSchema.parse(request.params);
      const file = await request.file();
      if (!file) throw new AppError(400, 'No file uploaded');

      validateMimeType(file.mimetype);

      const buffer = await file.toBuffer();
      validateFileSize(buffer.length);

      const service = createService(request);
      const data = await service.upload({
        entityType: params.entityType,
        entityId: params.entityId,
        fileName: file.filename,
        fileSize: buffer.length,
        mimeType: file.mimetype,
        data: buffer,
        uploadedBy: request.user!.userId,
      });

      reply.code(201);
      return { data };
    },
  );

  app.get(
    '/attachments/:entityType/:entityId',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request) => {
      const params = attachmentParamsSchema.parse(request.params);
      const service = createService(request);
      const data = await service.listByEntity(params.entityType, params.entityId);
      return { data };
    },
  );

  app.get(
    '/attachments/:id/download',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request, reply) => {
      const { id } = attachmentIdSchema.parse(request.params);
      const service = createService(request);
      const attachment = await service.getById(id);
      const storage = getStorageProvider();
      const stream = await storage.getStream(attachment.storageKey);

      reply
        .header('Content-Type', attachment.mimeType)
        .header('Content-Disposition', `attachment; filename="${attachment.fileName}"`)
        .header('Content-Length', attachment.fileSize);

      return reply.send(stream);
    },
  );

  app.delete(
    '/attachments/:id',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = attachmentIdSchema.parse(request.params);
      const service = createService(request);
      await service.deleteAttachment(id);
      return { data: null };
    },
  );
};

function createService(request: { server: { db: any }; tenantId: string }) {
  return new AttachmentService(
    request.server.db,
    request.tenantId,
    getStorageProvider(),
  );
}

function validateMimeType(mimeType: string): void {
  if (!ALLOWED_MIME_TYPES.includes(mimeType as any)) {
    throw new AppError(400, `File type '${mimeType}' is not allowed. Allowed: PDF, PNG, JPG, XLSX, CSV`);
  }
}

function validateFileSize(size: number): void {
  const maxSize = 10 * 1024 * 1024;
  if (size > maxSize) {
    throw new AppError(400, `File size exceeds 10MB limit`);
  }
}
