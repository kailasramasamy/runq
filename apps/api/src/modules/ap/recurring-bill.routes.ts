import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  uuidParamSchema, createRecurringBillSchema, updateRecurringBillSchema, recordRecurringPaymentSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { RecurringBillService } from './recurring-bill.service';
import { recordRecurringPayment, cancelRecurringPayment } from './recurring-bill-payment';
import { getStorageProvider } from '../../utils/storage';

const paymentParams = z.object({ id: z.string().uuid(), paymentId: z.string().uuid() });

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;

/** Rent / transport agreements: monthly bills, part payments and advances. */
export const recurringBillRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    return { data: await new RecurringBillService(req.server.db, req.tenantId).list() };
  });

  app.get('/:id', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    return { data: await new RecurringBillService(req.server.db, req.tenantId).detail(id) };
  });

  app.post('/', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (req, reply) => {
    const input = createRecurringBillSchema.parse(req.body);
    const row = await new RecurringBillService(req.server.db, req.tenantId).create(input, req.user!.userId);
    return reply.status(201).send({ data: row });
  });

  app.put('/:id', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = updateRecurringBillSchema.parse(req.body);
    return { data: await new RecurringBillService(req.server.db, req.tenantId).update(id, input) };
  });

  app.delete('/:id', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new RecurringBillService(req.server.db, req.tenantId);
    return { data: await svc.remove(id, getStorageProvider(), req.user!.userId) };
  });

  app.post('/:id/payments/:paymentId/cancel', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (req) => {
    const { id, paymentId } = paymentParams.parse(req.params);
    return { data: await cancelRecurringPayment(req.server.db, req.tenantId, id, paymentId, req.user!.userId) };
  });

  app.post('/:id/payments', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = recordRecurringPaymentSchema.parse(req.body);
    return { data: await recordRecurringPayment(req.server.db, req.tenantId, id, input, req.user!.userId) };
  });
};
