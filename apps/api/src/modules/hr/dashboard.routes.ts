import { FastifyPluginAsync } from 'fastify';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { documentAttachments, employees } from '@runq/db';
import { rbacHook } from '../../hooks/rbac';
import { HrDashboardService } from './dashboard.service';
import { applyHrScope, resolveHrAccessScope } from './access-scope';

const ALL = ['owner', 'accountant', 'viewer', 'hr', 'technician'] as const;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export const hrDashboardRoutes: FastifyPluginAsync = async (app) => {
  app.get('/dashboard', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const scope = await resolveHrAccessScope(req);
    const svc = new HrDashboardService(req.server.db, req.tenantId, scope);
    return { data: await svc.summary() };
  });

  /// Documents expiring inside the next `daysAhead` window (default 90).
  /// Joins to the employee so the dashboard row can show whose document
  /// it is without a follow-up fetch per row.
  app.get(
    '/dashboard/expiring-documents',
    { preHandler: [rbacHook([...ALL])] },
    async (req) => {
      const q = req.query as { daysAhead?: string };
      const daysAhead = q.daysAhead ? Math.max(1, Math.min(365, Number.parseInt(q.daysAhead, 10) || 90)) : 90;
      const today = new Date();
      const horizon = new Date(today);
      horizon.setDate(horizon.getDate() + daysAhead);

      // Scope: managers only see expiries for employees in their visible
      // team; admins/hr see the tenant.
      const scope = await resolveHrAccessScope(req);
      const where = applyHrScope(scope, documentAttachments.entityId, and(
        eq(documentAttachments.tenantId, req.tenantId),
        eq(documentAttachments.entityType, 'employee'),
        // `expiryDate` is a DATE column; comparing as strings is
        // correct since both sides are YYYY-MM-DD lexically sortable.
        sql`${documentAttachments.expiryDate} IS NOT NULL`,
        gte(documentAttachments.expiryDate, isoDate(today)),
        lte(documentAttachments.expiryDate, isoDate(horizon)),
      ));

      const rows = await req.server.db
        .select({
          id: documentAttachments.id,
          entityId: documentAttachments.entityId,
          documentKind: documentAttachments.documentKind,
          fileName: documentAttachments.fileName,
          expiryDate: documentAttachments.expiryDate,
          employeeCode: employees.employeeCode,
          firstName: employees.firstName,
          lastName: employees.lastName,
          employeePhotoUrl: employees.photoUrl,
        })
        .from(documentAttachments)
        .innerJoin(
          employees,
          and(
            eq(employees.id, documentAttachments.entityId),
            eq(employees.tenantId, req.tenantId),
          ),
        )
        .where(where)
        .orderBy(documentAttachments.expiryDate)
        .limit(50);

      return {
        data: rows.map((r) => ({
          id: r.id,
          employeeId: r.entityId,
          employeeCode: r.employeeCode,
          employeeName: `${r.firstName}${r.lastName ? ' ' + r.lastName : ''}`,
          employeePhotoUrl: r.employeePhotoUrl,
          documentKind: r.documentKind,
          fileName: r.fileName,
          expiryDate: r.expiryDate,
        })),
      };
    },
  );
};
