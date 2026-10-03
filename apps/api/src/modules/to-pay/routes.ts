import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { UserRole } from '@runq/types';
import { rbacHook } from '../../hooks/rbac';
import { toPayOverview } from './to-pay.service';

/**
 * The owner's "what do I still have to pay" overview. Not module-gated as a
 * whole — each category is included only when the user has that module.
 */
const querySchema = z.object({
  /** YYYY-MM — every payment for that month, paid or not. Omitted = all still owed. */
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

export const toPayRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: [rbacHook(['owner', 'accountant', 'hr', 'viewer'])] }, async (req) => {
    const { month } = querySchema.parse(req.query);
    const role = (req.activeRole || req.user?.role) as UserRole;
    const scope = month ? { kind: 'month' as const, month: `${month}-01` } : { kind: 'outstanding' as const };
    return { data: await toPayOverview(req.server.db, req.tenantId, { modules: req.effectiveModules ?? [], role }, scope) };
  });
};
