import { FastifyPluginAsync } from 'fastify';
import { createPendingPaymentSchema } from '@runq/validators';
import { z } from 'zod';
import { rbacHook } from '../../hooks/rbac';
import { PendingPaymentService } from './pending-payment.service';
import { ConfirmationExtractService } from './confirmation-extract.service';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const idParamSchema = z.object({ id: z.string().uuid() });
const listQuerySchema = z.object({
  status: z.enum(['pending', 'matched', 'cancelled']).optional().default('pending'),
});

export const pendingPaymentRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const body = createPendingPaymentSchema.parse(request.body);
      const service = new PendingPaymentService(request.server.db, request.tenantId);
      const row = await service.create(body, request.user!.userId);
      return reply.status(201).send({ data: row });
    },
  );

  app.get(
    '/',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { status } = listQuerySchema.parse(request.query);
      const service = new PendingPaymentService(request.server.db, request.tenantId);
      return { data: await service.list(status) };
    },
  );

  // OCR a UPI/bank confirmation screenshot to pre-fill the capture form.
  app.post(
    '/extract',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const file = await request.file();
      if (!file) return reply.status(400).send({ error: 'No file uploaded' });
      const buffer = await file.toBuffer();
      if (buffer.length > MAX_FILE_SIZE) {
        return reply.status(400).send({ error: 'File too large. Maximum size is 10 MB.' });
      }
      const mimeType = file.mimetype.toLowerCase();
      const data = await new ConfirmationExtractService().extract(buffer, mimeType);
      return { data };
    },
  );

  app.delete(
    '/:id',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { id } = idParamSchema.parse(request.params);
      const service = new PendingPaymentService(request.server.db, request.tenantId);
      await service.cancel(id);
      return reply.status(200).send({ data: { success: true } });
    },
  );
};
