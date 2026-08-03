// Resolves the set of employee IDs an HR request is allowed to see.
//
// Three shapes:
//   - { kind: 'all' }            — owner | accountant | client_owner | hr.
//                                  Tenant-wide read; no extra WHERE needed.
//   - { kind: 'subset', ids }    — a manager: reporting subtree (recursive
//                                  CTE on reportingToId) PLUS every employee
//                                  in any department where this user is
//                                  the head_employee_id.
//   - { kind: 'self', id }       — bare viewer who matched an employee row
//                                  by email or phone; reads own data only.
//   - { kind: 'none' }           — bare viewer with no employee row (e.g.
//                                  a CA login). No HR rows visible.
//
// "viewer" here means viewer *or* field_operator: `rbacHook` treats a
// collection-centre operator as a viewer, because they are an employee of the
// dairy too and self-service is the same surface for both.
//
// Use [applyHrScope] for the common `WHERE … IN (…)` decoration; callers
// that need the raw set (counts, joins, multi-table filters) read [.ids].

import { FastifyRequest } from 'fastify';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { employees, users } from '@runq/db';

export type HrAccessScope =
  | { kind: 'all' }
  | { kind: 'subset'; ids: Set<string>; selfEmployeeId: string }
  | { kind: 'self'; selfEmployeeId: string }
  | { kind: 'none' };

const ORG_WIDE_ROLES = new Set(['owner', 'accountant', 'client_owner', 'hr']);

/// Per-request memoisation key — recomputing the recursive CTE for every
/// HR route on a single request would be wasteful. Attached to the
/// FastifyRequest under a symbol so it can't collide with user fields.
const SCOPE_KEY = Symbol('hrAccessScope');

export async function resolveHrAccessScope(req: FastifyRequest): Promise<HrAccessScope> {
  const cached = (req as any)[SCOPE_KEY] as HrAccessScope | undefined;
  if (cached) return cached;

  const scope = await compute(req);
  (req as any)[SCOPE_KEY] = scope;
  return scope;
}

async function compute(req: FastifyRequest): Promise<HrAccessScope> {
  const role = req.activeRole;
  if (ORG_WIDE_ROLES.has(role)) return { kind: 'all' };

  // Below this point the role is `viewer` or `field_operator`. Match them to
  // an employee row; if there's no match, they have no HR access.
  const db = req.server.db;
  const tenantId = req.tenantId;
  const userId = req.user!.userId;

  const [userRow] = await db
    .select({ email: users.email, phone: users.phone })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!userRow) return { kind: 'none' };

  // Match the employee by email (web/email-login) OR by digit-normalised
  // phone (mobile OTP-login). Mirrors /hr/me — a phone-only employee with
  // no email must still resolve to a scope, otherwise every scoped HR
  // query (leave balances, leave requests, …) silently returns nothing.
  const phoneDigits = userRow.phone ?? '';
  const [emp] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(
      and(
        eq(employees.tenantId, tenantId),
        sql`(
          lower(${employees.email}) = lower(${userRow.email})
          OR (
            ${phoneDigits} <> ''
            AND regexp_replace(coalesce(${employees.phone}, ''), '\\D', '', 'g') IN (${phoneDigits}, ${'91' + phoneDigits})
          )
        )`,
      ),
    )
    .limit(1);
  if (!emp) return { kind: 'none' };

  // Build the visible set: self + descendants via reportingToId + every
  // employee in a department the user heads. One round-trip via CTE.
  const result = await db.execute<{ id: string }>(sql`
    WITH RECURSIVE reports(id) AS (
      SELECT id FROM employees
       WHERE tenant_id = ${tenantId} AND id = ${emp.id}
      UNION
      SELECT e.id FROM employees e
        JOIN reports r ON e.reporting_to_id = r.id
       WHERE e.tenant_id = ${tenantId}
    ),
    headed_dept_emps AS (
      SELECT e.id
        FROM employees e
        JOIN departments d
          ON d.id = e.department_id
         AND d.tenant_id = ${tenantId}
         AND d.head_employee_id = ${emp.id}
       WHERE e.tenant_id = ${tenantId}
    )
    SELECT id FROM reports
    UNION
    SELECT id FROM headed_dept_emps;
  `);

  const ids = new Set<string>((result.rows ?? []).map((r) => r.id));
  // Always include self even if the CTE somehow misses (defensive — the
  // self-row is the seed of the recursion, but cheaper to be sure).
  ids.add(emp.id);

  // If the visible set is only the user themselves, treat as `self` so
  // dashboards render the employee persona rather than an "empty team".
  if (ids.size === 1) return { kind: 'self', selfEmployeeId: emp.id };

  return { kind: 'subset', ids, selfEmployeeId: emp.id };
}

/// Decorate a Drizzle WHERE clause with the scope's id filter. Returns
/// the original `base` for org-wide scopes (no extra predicate); appends
/// `column IN (…)` for subset/self; forces `false` for `none`.
///
/// `column` is the Drizzle column referencing employees.id on the table
/// you're querying (e.g. `leaveRequests.employeeId`).
export function applyHrScope(
  scope: HrAccessScope,
  column: any,
  base: any,
): any {
  if (scope.kind === 'all') return base;
  if (scope.kind === 'none') return and(base, sql`false`);
  const ids = scope.kind === 'self'
    ? [scope.selfEmployeeId]
    : Array.from(scope.ids);
  if (ids.length === 0) return and(base, sql`false`);
  // Use inArray rather than ANY(::uuid[]) — drizzle binds JS arrays as a
  // record tuple ($1, $2, …) which Postgres refuses to cast to uuid[]
  // ("cannot cast type record to uuid[]"). inArray expands to a regular
  // `column IN ($1, $2, …)` with each id as its own parameter.
  return and(base, inArray(column, ids));
}

/// True when the scope is "all" — useful for shortcutting expensive
/// derivations that don't need per-id filtering (e.g. global counts that
/// the dashboard already aggregates server-side).
export function isOrgWide(scope: HrAccessScope): boolean {
  return scope.kind === 'all';
}
