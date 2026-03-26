import { FastifyPluginAsync } from 'fastify';
import { rbacHook } from '../../hooks/rbac';
import { isAIEnabled } from '../../utils/ai/claude.service';
import { ExtractService } from './extract.service';

const WRITE_ROLES = ['owner', 'accountant'] as const;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIMES: Record<string, boolean> = {
  'application/pdf': true,
  'image/png': true,
  'image/jpeg': true,
  'image/jpg': true,
};

export const extractRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/extract',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      if (!isAIEnabled()) {
        return reply.status(503).send({
          error: 'AI features require ANTHROPIC_API_KEY',
        });
      }

      const file = await request.file();
      if (!file) {
        return reply.status(400).send({ error: 'No file uploaded' });
      }

      const mimeType = file.mimetype.toLowerCase();
      if (!ALLOWED_MIMES[mimeType]) {
        return reply.status(400).send({
          error: 'Unsupported file type. Upload PDF, PNG, or JPG.',
        });
      }

      const buffer = await file.toBuffer();
      if (buffer.length > MAX_FILE_SIZE) {
        return reply.status(400).send({
          error: 'File too large. Maximum size is 10 MB.',
        });
      }

      const service = new ExtractService(
        request.server.db,
        request.tenantId,
      );
      const result = await service.extractFromFile(
        buffer,
        mimeType,
        file.filename,
      );

      return { data: result };
    },
  );
};
