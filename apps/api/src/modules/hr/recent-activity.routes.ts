import { FastifyPluginAsync } from 'fastify';
import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';
import {
  employees, leaveRequests, payrollRuns, employeeSalary,
  documentAttachments,
} from '@runq/db';
import { rbacHook } from '../../hooks/rbac';
import { applyHrScope, resolveHrAccessScope } from './access-scope';

const ALL_ROLES = ['owner', 'accountant', 'viewer', 'hr'] as const;

type ActivityKind =
  | 'employee_added'
  | 'employee_exited'
  | 'leave_approved'
  | 'leave_rejected'
  | 'salary_assigned'
  | 'document_uploaded'
  | 'payroll_started';

interface ActivityRow {
  id: string;          // unique enough: kind + source row id
  kind: ActivityKind;
  occurredAt: string;  // ISO
  title: string;       // 1-line human summary
  subject: string | null; // usually employee name
  employeeId: string | null;
  employeeName: string | null;
}

/// Roll-up of the most recent meaningful HR events. We don't have an audit
/// table, so each kind is a small per-table query unioned in the app layer.
/// The route caps each source at 10 rows then merges + sorts by timestamp.
export const hrRecentActivityRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/dashboard/recent-activity',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (req) => {
      const tenantId = req.tenantId;
      const db = req.server.db;
      const LIMIT_PER_SOURCE = 10;
      const scope = await resolveHrAccessScope(req);

      const [empAdds, empExits, leavesReviewed, salaries, docs, runs] = await Promise.all([
        db.select({
          id: employees.id,
          when: employees.createdAt,
          first: employees.firstName,
          last: employees.lastName,
          employeeId: employees.id,
        })
          .from(employees)
          .where(applyHrScope(scope, employees.id, eq(employees.tenantId, tenantId)))
          .orderBy(desc(employees.createdAt))
          .limit(LIMIT_PER_SOURCE),

        db.select({
          id: employees.id,
          when: employees.exitDate,
          first: employees.firstName,
          last: employees.lastName,
          employeeId: employees.id,
        })
          .from(employees)
          .where(applyHrScope(scope, employees.id, and(
            eq(employees.tenantId, tenantId), isNotNull(employees.exitDate),
          )))
          .orderBy(desc(employees.exitDate))
          .limit(LIMIT_PER_SOURCE),

        db.select({
          id: leaveRequests.id,
          when: leaveRequests.reviewedAt,
          status: leaveRequests.status,
          empId: leaveRequests.employeeId,
          first: employees.firstName,
          last: employees.lastName,
        })
          .from(leaveRequests)
          .innerJoin(employees, eq(employees.id, leaveRequests.employeeId))
          .where(applyHrScope(scope, leaveRequests.employeeId, and(
            eq(leaveRequests.tenantId, tenantId),
            isNotNull(leaveRequests.reviewedAt),
          )))
          .orderBy(desc(leaveRequests.reviewedAt))
          .limit(LIMIT_PER_SOURCE),

        db.select({
          id: employeeSalary.id,
          when: employeeSalary.createdAt,
          empId: employeeSalary.employeeId,
          first: employees.firstName,
          last: employees.lastName,
        })
          .from(employeeSalary)
          .innerJoin(employees, eq(employees.id, employeeSalary.employeeId))
          .where(applyHrScope(scope, employeeSalary.employeeId,
            eq(employeeSalary.tenantId, tenantId)))
          .orderBy(desc(employeeSalary.createdAt))
          .limit(LIMIT_PER_SOURCE),

        db.select({
          id: documentAttachments.id,
          when: documentAttachments.createdAt,
          empId: documentAttachments.entityId,
          kind: documentAttachments.documentKind,
          first: employees.firstName,
          last: employees.lastName,
        })
          .from(documentAttachments)
          .innerJoin(employees, eq(employees.id, documentAttachments.entityId))
          .where(applyHrScope(scope, documentAttachments.entityId, and(
            eq(documentAttachments.tenantId, tenantId),
            eq(documentAttachments.entityType, 'employee'),
          )))
          .orderBy(desc(documentAttachments.createdAt))
          .limit(LIMIT_PER_SOURCE),

        // Payroll runs are tenant-wide events; managers don't run payroll,
        // so we only surface them for org-wide scopes (admins/HR/accountant).
        scope.kind === 'all'
          ? db.select({
              id: payrollRuns.id,
              when: payrollRuns.createdAt,
              month: payrollRuns.month,
              year: payrollRuns.year,
            })
              .from(payrollRuns)
              .where(eq(payrollRuns.tenantId, tenantId))
              .orderBy(desc(payrollRuns.createdAt))
              .limit(LIMIT_PER_SOURCE)
          : Promise.resolve([] as Array<{ id: string; when: Date | null; month: number; year: number }>),
      ]);

      const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const out: ActivityRow[] = [];

      const name = (f: string, l: string | null) => l ? `${f} ${l}` : f;
      const iso = (d: Date | string | null) => {
        if (!d) return '';
        return typeof d === 'string' ? new Date(d).toISOString() : d.toISOString();
      };

      for (const r of empAdds) out.push({
        id: `add:${r.id}`, kind: 'employee_added', occurredAt: iso(r.when),
        title: 'Added to roster', subject: name(r.first, r.last),
        employeeId: r.employeeId, employeeName: name(r.first, r.last),
      });
      for (const r of empExits) out.push({
        id: `exit:${r.id}`, kind: 'employee_exited', occurredAt: iso(r.when),
        title: 'Marked as exited', subject: name(r.first, r.last),
        employeeId: r.employeeId, employeeName: name(r.first, r.last),
      });
      for (const r of leavesReviewed) out.push({
        id: `leave:${r.id}`,
        kind: r.status === 'approved' ? 'leave_approved' : 'leave_rejected',
        occurredAt: iso(r.when),
        title: r.status === 'approved' ? 'Leave approved' : 'Leave rejected',
        subject: name(r.first, r.last),
        employeeId: r.empId, employeeName: name(r.first, r.last),
      });
      for (const r of salaries) out.push({
        id: `salary:${r.id}`, kind: 'salary_assigned', occurredAt: iso(r.when),
        title: 'Salary structure assigned', subject: name(r.first, r.last),
        employeeId: r.empId, employeeName: name(r.first, r.last),
      });
      for (const r of docs) out.push({
        id: `doc:${r.id}`, kind: 'document_uploaded', occurredAt: iso(r.when),
        title: `${(r.kind ?? 'Document').replace(/_/g, ' ')} uploaded`,
        subject: name(r.first, r.last),
        employeeId: r.empId, employeeName: name(r.first, r.last),
      });
      for (const r of runs) out.push({
        id: `run:${r.id}`, kind: 'payroll_started', occurredAt: iso(r.when),
        title: `Payroll run · ${M[r.month - 1]} ${r.year}`,
        subject: null, employeeId: null, employeeName: null,
      });

      out.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
      return { data: out.slice(0, 20) };
    },
  );
};
