import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { uuidParamSchema } from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { PaymentClaimService } from './payment-claim.service';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;

const listQuerySchema = z.object({
  status: z.enum(['pending', 'verified', 'rejected', 'cancelled']).optional(),
  customerId: z.string().uuid().optional(),
  invoiceId: z.string().uuid().optional(),
});

const verifyBodySchema = z.object({
  bankAccountId: z.string().uuid(),
  receiptDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  referenceNumber: z.string().max(100).optional().nullable(),
});

const rejectBodySchema = z.object({
  reason: z.string().max(500).optional().nullable(),
});

export const paymentClaimRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const filters = listQuerySchema.parse(request.query);
      const service = new PaymentClaimService(request.server.db, request.tenantId);
      const data = await service.listAll(filters);
      return { data };
    },
  );

  app.post(
    '/:id/verify',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const body = verifyBodySchema.parse(request.body);
      const service = new PaymentClaimService(request.server.db, request.tenantId);
      const result = await service.verify(id, body);
      return { data: result };
    },
  );

  app.post(
    '/:id/reject',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const body = rejectBodySchema.parse(request.body);
      const service = new PaymentClaimService(request.server.db, request.tenantId);
      await service.reject(id, body.reason);
      return { ok: true };
    },
  );
};
