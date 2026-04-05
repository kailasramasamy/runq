import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { rbacHook } from '../../hooks/rbac';
import { NEFTExportService } from './neft-export.service';

const WRITE_ROLES = ['owner', 'accountant'] as const;

const neftExportBodySchema = z.object({
  paymentIds: z.array(z.string().uuid()).min(1),
});

const scheduleParamSchema = z.object({ id: z.string().uuid() });

export const neftExportRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { paymentIds } = neftExportBodySchema.parse(request.body);
      const service = new NEFTExportService(request.server.db, request.tenantId);
      const csv = await service.generatePaymentFile(paymentIds);
      return reply
        .type('text/csv')
        .header('Content-Disposition', 'attachment; filename="neft-payment.csv"')
        .send(csv);
    },
  );

  app.post(
    '/schedule/:id',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { id } = scheduleParamSchema.parse(request.params);
      const service = new NEFTExportService(request.server.db, request.tenantId);
      const csv = await service.generateFromSchedule(id);
      return reply
        .type('text/csv')
        .header('Content-Disposition', `attachment; filename="neft-schedule-${id}.csv"`)
        .send(csv);
    },
  );
};
