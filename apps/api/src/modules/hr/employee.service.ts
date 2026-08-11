import { eq, and, or, ilike, isNull, sql, desc } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { employees, departments, designations, users } from '@runq/db';
import type { Db } from '@runq/db';
import { applyPagination, calcTotalPages } from '@runq/db';
import type {
  CreateEmployeeInput, UpdateEmployeeInput, EmployeeFilter,
} from '@runq/validators';
import { NotFoundError, ConflictError } from '../../utils/errors';
import { normalisePhone } from '../../utils/phone';
import { applyHrScope } from './access-scope';
import { LeaveBalanceService } from './leave-balance.service';

type EmployeeRow = typeof employees.$inferSelect;

export class EmployeeService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
    /// Optional per-request scope. Defaults to org-wide so internal
    /// callers (services, scripts, payroll jobs) keep their full view.
    private readonly scope: import('./access-scope').HrAccessScope = { kind: 'all' },
  ) {}

  async list(filter: EmployeeFilter) {
    const { page, limit, search, status, departmentId, designationId, employmentType } = filter;
    const { offset } = applyPagination(page, limit);

    const where = applyHrScope(this.scope, employees.id, and(
      eq(employees.tenantId, this.tenantId),
      isNull(employees.deletedAt),
      status ? eq(employees.status, status) : undefined,
      departmentId ? eq(employees.departmentId, departmentId) : undefined,
      designationId ? eq(employees.designationId, designationId) : undefined,
      employmentType ? eq(employees.employmentType, employmentType) : undefined,
      search
        ? or(
            ilike(employees.firstName, `%${search}%`),
            ilike(employees.lastName, `%${search}%`),
            ilike(employees.employeeCode, `%${search}%`),
            ilike(employees.email, `%${search}%`),
            ilike(employees.phone, `%${search}%`),
          )
        : undefined,
    ));

    const [rows, countResult] = await Promise.all([
      this.db
        .select({
          emp: employees,
          departmentName: departments.name,
          designationName: designations.name,
        })
        .from(employees)
        .leftJoin(departments, eq(departments.id, employees.departmentId))
        .leftJoin(designations, eq(designations.id, employees.designationId))
        .where(where)
        .orderBy(desc(employees.createdAt))
        .limit(limit)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(employees).where(where),
    ]);

    const total = countResult[0]?.count ?? 0;
    return {
      data: rows.map((r) => ({ ...r.emp, departmentName: r.departmentName, designationName: r.designationName })),
      meta: { page, limit, total, totalPages: calcTotalPages(total, limit) },
    };
  }

  async getById(id: string) {
    // Self-join to resolve the reporting manager's name for the detail view.
    const mgr = alias(employees, 'mgr');
    const [row] = await this.db
      .select({
        emp: employees,
        departmentName: departments.name,
        designationName: designations.name,
        mgrFirstName: mgr.firstName,
        mgrLastName: mgr.lastName,
      })
      .from(employees)
      .leftJoin(departments, eq(departments.id, employees.departmentId))
      .leftJoin(designations, eq(designations.id, employees.designationId))
      .leftJoin(mgr, eq(mgr.id, employees.reportingToId))
      .where(applyHrScope(this.scope, employees.id, and(
        eq(employees.id, id),
        eq(employees.tenantId, this.tenantId),
        isNull(employees.deletedAt),
      )))
      .limit(1);
    // Out-of-scope rows look identical to non-existent ones to the caller
    // — both 404. We never reveal that a record exists but is forbidden.
    if (!row) throw new NotFoundError('Employee');
    const reportingToName = row.mgrFirstName
      ? `${row.mgrFirstName}${row.mgrLastName ? ` ${row.mgrLastName}` : ''}`
      : null;
    return {
      ...row.emp,
      departmentName: row.departmentName,
      designationName: row.designationName,
      reportingToName,
    };
  }

  async getByCode(code: string): Promise<EmployeeRow | null> {
    const [row] = await this.db
      .select()
      .from(employees)
      .where(and(
        eq(employees.tenantId, this.tenantId),
        eq(employees.employeeCode, code),
        isNull(employees.deletedAt),
      ))
      .limit(1);
    return row ?? null;
  }

  async create(input: CreateEmployeeInput) {
    const employeeCode = input.employeeCode ?? (await this.nextEmployeeCode());
    const [existing] = await this.db
      .select({ id: employees.id })
      .from(employees)
      .where(and(
        eq(employees.tenantId, this.tenantId),
        eq(employees.employeeCode, employeeCode),
      ))
      .limit(1);
    if (existing) throw new ConflictError('Employee code already exists');

    const [row] = await this.db
      .insert(employees)
      .values({ tenantId: this.tenantId, ...this.normalize(input), employeeCode } as any)
      .returning();

    // Seed the new hire's leave balances for the current year so their
    // Leave screen is populated immediately. Proration inside the
    // service handles a mid-year join; with no leave types configured
    // this is a no-op. Re-runnable via the HR "Initialize balances"
    // action if leave types change later.
    await new LeaveBalanceService(this.db, this.tenantId)
      .provisionForEmployee(row.id, new Date().getFullYear());

    return row;
  }

  async update(id: string, input: UpdateEmployeeInput) {
    const [row] = await this.db
      .update(employees)
      .set({ ...this.normalize(input), updatedAt: new Date() } as any)
      .where(applyHrScope(this.scope, employees.id, and(
        eq(employees.id, id),
        eq(employees.tenantId, this.tenantId),
        isNull(employees.deletedAt),
      )))
      .returning();
    if (!row) throw new NotFoundError('Employee');
    return row;
  }

  async remove(id: string) {
    const [row] = await this.db
      .update(employees)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(applyHrScope(this.scope, employees.id,
        and(eq(employees.id, id), eq(employees.tenantId, this.tenantId))))
      .returning();
    if (!row) throw new NotFoundError('Employee');
    return row;
  }

  /// Clear the mobile-login bind: zero the DOB-attempt throttle and unlink the
  /// employee's Google/Apple identity so they can re-bind from a fresh device
  /// or a different social account. Used by the admin "Reset mobile login"
  /// action after a lockout or a wrong-account bind.
  async resetMobileLogin(id: string) {
    const [emp] = await this.db
      .update(employees)
      .set({ mobileBindAttempts: 0, updatedAt: new Date() })
      .where(applyHrScope(this.scope, employees.id, and(
        eq(employees.id, id),
        eq(employees.tenantId, this.tenantId),
        isNull(employees.deletedAt),
      )))
      .returning();
    if (!emp) throw new NotFoundError('Employee');

    // Unbind the backing user (matched by phone) so a re-bind can attach a new
    // firebase_uid. Email-only users with no phone are left untouched.
    const phone = emp.phone ? normalisePhone(emp.phone) : null;
    if (phone) {
      const matchExpr = sql`regexp_replace(${users.phone}, '\\D', '', 'g')`;
      await this.db
        .update(users)
        .set({ firebaseUid: null, authProvider: null })
        .where(and(
          eq(users.tenantId, this.tenantId),
          sql`(${matchExpr} = ${phone} OR ${matchExpr} = ${'91' + phone})`,
        ));
    }
    return { ok: true };
  }

  /**
   * Next employee code, continuing whatever numbering the tenant already
   * uses rather than imposing one. The most recently created code that
   * ends in digits defines the shape — prefix, separator and zero-padding
   * width are all copied from it, so a tenant on "EMP-0010" gets
   * "EMP-0011" and one on "VD001" gets "VD002".
   *
   * The sequence comes from the MAX suffix across every code sharing that
   * prefix, not from the last row's own number, so a gap left by a
   * deleted employee is never reused. Falls back to EMP-0001 for a tenant
   * with no numeric codes at all.
   */
  async nextEmployeeCode(): Promise<string> {
    const [last] = await this.db
      .select({ code: employees.employeeCode })
      .from(employees)
      .where(and(
        eq(employees.tenantId, this.tenantId),
        sql`${employees.employeeCode} ~ '[0-9]+$'`,
      ))
      .orderBy(desc(employees.createdAt))
      .limit(1);

    // Split trailing digits from whatever precedes them ("EMP-" + "0010").
    const parsed = last?.code ? /^(.*?)(\d+)$/.exec(last.code) : null;
    const prefix = parsed?.[1] ?? 'EMP-';
    const width = parsed?.[2]?.length ?? 4;

    const [agg] = await this.db
      .select({
        maxSeq: sql<number>`COALESCE(MAX((regexp_replace(${employees.employeeCode}, '^.*?(\\d+)$', '\\1'))::bigint), 0)`,
      })
      .from(employees)
      .where(and(
        eq(employees.tenantId, this.tenantId),
        // Match the prefix literally — a tenant running both "EMP-0010"
        // and "VD001" must not have the two sequences bleed together.
        // starts_with, not LIKE: codes may contain `_`, which LIKE would
        // read as a single-character wildcard.
        sql`starts_with(${employees.employeeCode}, ${prefix})`,
        sql`${employees.employeeCode} ~ '[0-9]+$'`,
      ));

    let seq = Number(agg?.maxSeq ?? 0) + 1;
    // Safety net for odd manual codes that share the prefix but sort oddly.
    while (await this.codeExists(`${prefix}${String(seq).padStart(width, '0')}`)) seq += 1;
    return `${prefix}${String(seq).padStart(width, '0')}`;
  }

  private async codeExists(code: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: employees.id })
      .from(employees)
      .where(and(eq(employees.tenantId, this.tenantId), eq(employees.employeeCode, code)))
      .limit(1);
    return !!row;
  }

  private normalize(input: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = { ...input };
    if (out.ctcAnnual != null) out.ctcAnnual = String(out.ctcAnnual);
    if (out.dailyWageRate != null) out.dailyWageRate = String(out.dailyWageRate);
    for (const k of ['email', 'pan', 'aadhaar', 'uan', 'bankIfsc', 'agency']) {
      if (out[k] === '') out[k] = null;
    }
    return out;
  }
}
