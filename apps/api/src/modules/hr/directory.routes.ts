import { FastifyPluginAsync } from 'fastify';
import { and, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { employees, departments, designations } from '@runq/db';
import type { Db } from '@runq/db';
import { applyPagination, calcTotalPages } from '@runq/db';
import { rbacHook } from '../../hooks/rbac';
import { NotFoundError } from '../../utils/errors';
import { ResumeProfileService, ResumeProfileRow } from './resume-profile.service';

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

const ALL = ['owner', 'accountant', 'viewer', 'hr', 'client_owner', 'technician'] as const;

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

  // GET /hr/org-chart — org-wide reporting hierarchy. Like /directory it
  // skips HrAccessScope so every employee can view the whole company
  // chart, and exposes only structural + safe identity fields (name,
  // photo, title, department, reporting line) — never salary or statutory
  // data. Returned unpaginated: an org chart needs the entire tree, and
  // SME headcounts keep the payload small. The 2000-row cap is a sanity
  // guard, not a real limit any target tenant approaches.
  app.get(
    '/org-chart',
    { preHandler: [rbacHook([...ALL])] },
    async (req) => {
      const rows = await req.server.db
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
          reportingToId: employees.reportingToId,
        })
        .from(employees)
        .leftJoin(departments, eq(departments.id, employees.departmentId))
        .leftJoin(designations, eq(designations.id, employees.designationId))
        .where(
          and(
            eq(employees.tenantId, req.tenantId),
            eq(employees.status, 'active'),
            isNull(employees.deletedAt),
          ),
        )
        .orderBy(employees.firstName, employees.lastName)
        .limit(2000);
      return { data: rows };
    },
  );

  // GET /hr/directory/:id — a single colleague's *work profile*. Unscoped
  // like /directory: anyone in the tenant can open anyone. Returns only
  // collaboration-safe fields plus the reporting line (manager + direct
  // reports) and the AI-extracted resume profile (summary / experience /
  // education / skills). Salary, bank, statutory IDs, DOB and address are
  // never selected — the full HR record stays behind the scoped
  // /hr/people/:id route.
  app.get(
    '/directory/:id',
    { preHandler: [rbacHook([...ALL])] },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const db = req.server.db;
      const tenantId = req.tenantId;

      const [profile, directReports, resume] = await Promise.all([
        fetchWorkProfile(db, tenantId, id),
        fetchDirectReports(db, tenantId, id),
        new ResumeProfileService(db, tenantId).getByEmployee(id),
      ]);
      if (!profile) throw new NotFoundError('Employee');

      return { data: { ...profile, directReports, resume: safeResume(resume) } };
    },
  );
};

// ─── /hr/directory/:id helpers ──────────────────────────────────────────────

/// Collaboration-safe employee fields + the manager card. Returns null when
/// no non-deleted employee with this id exists in the tenant.
async function fetchWorkProfile(db: Db, tenantId: string, id: string) {
  const mgr = alias(employees, 'mgr');
  const mgrDesig = alias(designations, 'mgr_desig');
  const [row] = await db
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
      employmentType: employees.employmentType,
      status: employees.status,
      joiningDate: employees.joiningDate,
      reportingToId: employees.reportingToId,
      mgrId: mgr.id,
      mgrFirstName: mgr.firstName,
      mgrLastName: mgr.lastName,
      mgrPhotoUrl: mgr.photoUrl,
      mgrDesignationName: mgrDesig.name,
    })
    .from(employees)
    .leftJoin(departments, eq(departments.id, employees.departmentId))
    .leftJoin(designations, eq(designations.id, employees.designationId))
    .leftJoin(mgr, eq(mgr.id, employees.reportingToId))
    .leftJoin(mgrDesig, eq(mgrDesig.id, mgr.designationId))
    .where(and(
      eq(employees.tenantId, tenantId),
      eq(employees.id, id),
      isNull(employees.deletedAt),
    ))
    .limit(1);
  if (!row) return null;

  const { mgrId, mgrFirstName, mgrLastName, mgrPhotoUrl, mgrDesignationName, ...emp } = row;
  return {
    ...emp,
    manager: mgrId
      ? {
          id: mgrId,
          firstName: mgrFirstName,
          lastName: mgrLastName,
          photoUrl: mgrPhotoUrl,
          designationName: mgrDesignationName,
        }
      : null,
  };
}

/// Active employees who report directly to [managerId] — safe fields only.
function fetchDirectReports(db: Db, tenantId: string, managerId: string) {
  return db
    .select({
      id: employees.id,
      employeeCode: employees.employeeCode,
      firstName: employees.firstName,
      lastName: employees.lastName,
      photoUrl: employees.photoUrl,
      designationName: designations.name,
      status: employees.status,
    })
    .from(employees)
    .leftJoin(designations, eq(designations.id, employees.designationId))
    .where(and(
      eq(employees.tenantId, tenantId),
      eq(employees.reportingToId, managerId),
      eq(employees.status, 'active'),
      isNull(employees.deletedAt),
    ))
    .orderBy(employees.firstName, employees.lastName);
}

/// Strip the resume profile down to the LinkedIn-style public fields —
/// drops sourceAttachmentId so colleagues can't pull the raw resume file,
/// plus the AI-confidence / audit columns the directory has no use for.
function safeResume(row: ResumeProfileRow | null) {
  if (!row) return null;
  return {
    summary: row.summary,
    experience: row.experience,
    education: row.education,
    skills: row.skills,
    certifications: row.certifications,
    languages: row.languages,
    totalExpYears: row.totalExpYears,
  };
}
