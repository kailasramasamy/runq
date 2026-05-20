import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { rbacHook } from '../../hooks/rbac';
import { WageRegisterService } from './wage-register.service';

// Wage register exposes every worker's pay — admin roles only, no viewer.
const MANAGE = ['owner', 'accountant', 'hr'] as const;

const monthQuery = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

export const wageRegisterRoutes: FastifyPluginAsync = async (app) => {
  app.get('/wage-register', { preHandler: [rbacHook([...MANAGE])] }, async (req) => {
    const { year, month } = monthQuery.parse(req.query);
    const svc = new WageRegisterService(req.server.db, req.tenantId);
    return { data: await svc.generate(year, month) };
  });

  app.get('/wage-register/export', { preHandler: [rbacHook([...MANAGE])] }, async (req, reply) => {
    const { year, month } = monthQuery.parse(req.query);
    const svc = new WageRegisterService(req.server.db, req.tenantId);
    const rows = await svc.generate(year, month);
    return reply
      .type('text/csv')
      .header('content-disposition', `attachment; filename="wage-register-${year}-${String(month).padStart(2, '0')}.csv"`)
      .send(svc.toCsv(rows));
  });
};
