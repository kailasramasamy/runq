import { FastifyPluginAsync } from 'fastify';
import { and, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { employees, departments, designations } from '@runq/db';
import { applyPagination, calcTotalPages } from '@runq/db';
import { rbacHook } from '../../hooks/rbac';

// Org-wide employee directory. Unlike /hr/employees this endpoint does NOT
// apply HrAccessScope — every authenticated user in the tenant can look up
// any colleague. The column list is intentionally minimal so the directory
// only exposes "safe" identity + contact fields; salary, statutory IDs,
// bank details, and birth date never leave the server.
//
// Mirrors common HRMS patterns (BambooHR, Keka, Zoho People, Teams/Slack
// directory). If branch-scoping becomes a customer ask later, gate by
// employees.branchId here rather than re-introducing applyHrScope.

const directoryQuerySchema = z.object({
  search: z.string().trim().min(1).max(120).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(25),
});

const ALL = ['owner', 'accountant', 'viewer', 'hr', 'client_owner'] as const;

export const hrDirectoryRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/directory',
    { preHandler: [rbacHook([...ALL])] },
    async (req) => {
      const { search, page, limit } = directoryQuerySchema.parse(req.query);
      const { offset } = applyPagination(page, limit);

      // Active employees only — terminated/inactive rows would clutter the
      // directory and create awkward "ghost colleague" entries. HR admins
      // who need that view should use /hr/employees with the status filter.
      const where = and(
        eq(employees.tenantId, req.tenantId),
        eq(employees.status, 'active'),
        isNull(employees.deletedAt),
        search
          ? or(
              ilike(employees.firstName, `%${search}%`),
              ilike(employees.lastName, `%${search}%`),
              ilike(employees.employeeCode, `%${search}%`),
              ilike(employees.email, `%${search}%`),
              ilike(employees.phone, `%${search}%`),
              ilike(departments.name, `%${search}%`),
              ilike(designations.name, `%${search}%`),
            )
          : undefined,
      );

      const [rows, countResult] = await Promise.all([
        req.server.db
          .select({
            id: employees.id,
            employeeCode: employees.employeeCode,
            firstName: employees.firstName,
            lastName: employees.lastName,
            email: employees.email,
            phone: employees.phone,
            photoUrl: employees.photoUrl,
            departmentId: employees.departmentId,
            departmentName: departments.name,
            designationId: employees.designationId,
            designationName: designations.name,
            status: employees.status,
          })
          .from(employees)
          .leftJoin(departments, eq(departments.id, employees.departmentId))
          .leftJoin(designations, eq(designations.id, employees.designationId))
          .where(where)
          .orderBy(employees.firstName, employees.lastName)
          .limit(limit)
          .offset(offset),
        req.server.db
          .select({ count: sql<number>`count(*)::int` })
          .from(employees)
          .leftJoin(departments, eq(departments.id, employees.departmentId))
          .leftJoin(designations, eq(designations.id, employees.designationId))
          .where(where),
      ]);

      const total = countResult[0]?.count ?? 0;
      return {
        data: rows,
        meta: { page, limit, total, totalPages: calcTotalPages(total, limit) },
      };
    },
  );
};
