import { FastifyPluginAsync } from 'fastify';
import {
  receiveAgainstPoSchema,
  scanReceiveAgainstPoSchema,
  uuidParamSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { ReceiveService } from './receive.service';
import { ScanReceiveService } from './scan-receive.service';

const MAX_SCAN_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_SCAN_MIMES: Record<string, boolean> = {
  'application/pdf': true,
  'image/png': true,
  'image/jpeg': true,
  'image/jpg': true,
};
function resolveScanMime(mimetype: string, filename: string): string {
  const mime = mimetype.toLowerCase();
  if (ALLOWED_SCAN_MIMES[mime]) return mime;
  const ext = filename.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  };
  return map[ext ?? ''] ?? mime;
}

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;

export const receiveRoutes: FastifyPluginAsync = async (app) => {
  // GET /purchase/pos/:id/receive-template
  app.get(
    '/:id/receive-template',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const svc = new ReceiveService(request.server.db, request.tenantId, request.user?.userId);
      const data = await svc.getTemplate(id);
      return { data };
    },
  );

  // POST /purchase/pos/:id/receive
  app.post(
    '/:id/receive',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = receiveAgainstPoSchema.parse(request.body);
      const svc = new ReceiveService(request.server.db, request.tenantId, request.user?.userId);
      const data = await svc.receive(id, input);
      return reply.status(201).send({ data });
    },
  );

  // PP Phase 5: scan vendor invoice on PO receive.
  // Two-step flow — preview (multipart upload) → commit (JSON with edits).
  app.post(
    '/:id/scan-preview',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { id } = uuidParamSchema.parse(request.params);
      const file = await request.file();
      if (!file) return reply.status(400).send({ error: 'No file uploaded' });
      const mimeType = resolveScanMime(file.mimetype, file.filename);
      if (!ALLOWED_SCAN_MIMES[mimeType]) {
        return reply.status(400).send({ error: 'Unsupported file type. Upload PDF, PNG, or JPG.' });
      }
      const buffer = await file.toBuffer();
      if (buffer.length > MAX_SCAN_SIZE) {
        return reply.status(400).send({ error: 'File too large. Maximum size is 10 MB.' });
      }
      const svc = new ScanReceiveService(
        request.server.db, request.server.redis, request.tenantId, request.user.userId,
      );
      const data = await svc.previewScan(id, buffer, mimeType, file.filename);
      return { data };
    },
  );

  app.post(
    '/:id/scan-commit',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = scanReceiveAgainstPoSchema.parse(request.body);
      const svc = new ScanReceiveService(
        request.server.db, request.server.redis, request.tenantId, request.user.userId,
      );
      const data = await svc.commitScan(id, input);
      return reply.status(201).send({ data });
    },
  );
};
