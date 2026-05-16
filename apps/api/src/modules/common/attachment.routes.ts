import { FastifyPluginAsync } from 'fastify';
import {
  attachmentParamsSchema, attachmentIdSchema,
  ALLOWED_MIME_TYPES, HR_DOC_ALLOWED_MIME_TYPES,
  employeeDocumentKindSchema,
} from '@runq/validators';
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

      // Employee docs use a stricter image+PDF whitelist; finance docs allow
      // spreadsheets and CSV too. Validation diverges accordingly.
      validateMimeType(file.mimetype, params.entityType);

      const buffer = await file.toBuffer();
      validateFileSize(buffer.length);

      // `kind` and `expiryDate` are optional multipart fields, only
      // meaningful for HR uploads. multipart fields arrive on the same
      // iterator as files — pull from `file.fields` which Fastify
      // aggregates after the file is consumed.
      const fieldVal = (name: string): string | undefined =>
        (file.fields as Record<string, { value?: string } | undefined>)?.[name]?.value;
      const rawKind = fieldVal('kind');
      const documentKind =
        params.entityType === 'employee' && rawKind
          ? employeeDocumentKindSchema.parse(rawKind)
          : null;
      // Expiry date is optional and only applied to employee docs. Format
      // is YYYY-MM-DD; anything else is dropped silently rather than
      // failing the whole upload.
      const rawExpiry = fieldVal('expiryDate');
      const expiryDate =
        params.entityType === 'employee' && rawExpiry && /^\d{4}-\d{2}-\d{2}$/.test(rawExpiry)
          ? rawExpiry
          : null;

      const service = createService(request);
      const data = await service.upload({
        entityType: params.entityType,
        entityId: params.entityId,
        fileName: file.filename,
        fileSize: buffer.length,
        mimeType: file.mimetype,
        data: buffer,
        uploadedBy: request.user!.userId,
        documentKind,
        expiryDate,
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
      const q = request.query as { kind?: string };
      const documentKind = q.kind ? employeeDocumentKindSchema.parse(q.kind) : undefined;
      const service = createService(request);
      const data = await service.listByEntity(params.entityType, params.entityId, documentKind);
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

function validateMimeType(mimeType: string, entityType: string): void {
  const whitelist =
    entityType === 'employee' ? HR_DOC_ALLOWED_MIME_TYPES : ALLOWED_MIME_TYPES;
  if (!whitelist.includes(mimeType as any)) {
    const label =
      entityType === 'employee' ? 'PDF, PNG, JPG, WEBP' : 'PDF, PNG, JPG, XLSX, CSV';
    throw new AppError(400, `File type '${mimeType}' is not allowed. Allowed: ${label}`);
  }
}

function validateFileSize(size: number): void {
  const maxSize = 10 * 1024 * 1024;
  if (size > maxSize) {
    throw new AppError(400, `File size exceeds 10MB limit`);
  }
}
