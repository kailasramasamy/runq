import { eq, and, gte, lte, desc, inArray, sql } from 'drizzle-orm';
import {
  leaveRequests, leaveTypes, leaveBalances, employees, attendance, users,
} from '@runq/db';
import type { Db } from '@runq/db';
import type {
  CreateLeaveRequestInput, ReviewLeaveRequestInput, LeaveRequestFilter,
  UpdateLeaveRequestInput,
} from '@runq/validators';
import { NotFoundError, ConflictError } from '../../utils/errors';
import { countLeaveDays, countedLeaveDates } from './leave-days';
import { resolveWeeklyOffDays, resolveHolidayDates } from './work-calendar';
import { LeaveBalanceService } from './leave-balance.service';
import { applyHrScope, type HrAccessScope } from './access-scope';

export class LeaveRequestService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
    /// Optional scope. Defaults to org-wide so internal callers (payroll
    /// posting, balance carry-forward) keep their tenant-wide view.
    private readonly scope: HrAccessScope = { kind: 'all' },
  ) {}

  async list(filter: LeaveRequestFilter) {
    const where = applyHrScope(this.scope, leaveRequests.employeeId, and(
      eq(leaveRequests.tenantId, this.tenantId),
      filter.employeeId ? eq(leaveRequests.employeeId, filter.employeeId) : undefined,
      filter.leaveTypeId ? eq(leaveRequests.leaveTypeId, filter.leaveTypeId) : undefined,
      filter.status ? eq(leaveRequests.status, filter.status) : undefined,
      filter.dateFrom ? gte(leaveRequests.fromDate, filter.dateFrom) : undefined,
      filter.dateTo ? lte(leaveRequests.toDate, filter.dateTo) : undefined,
    ));

    const rows = await this.db
      .select({
        req: leaveRequests,
        typeName: leaveTypes.name,
        typeCode: leaveTypes.code,
        isPaid: leaveTypes.isPaid,
        employeeCode: employees.employeeCode,
        firstName: employees.firstName,
        lastName: employees.lastName,
        photoUrl: employees.photoUrl,
      })
      .from(leaveRequests)
      .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
      .innerJoin(employees, eq(employees.id, leaveRequests.employeeId))
      .where(where)
      .orderBy(desc(leaveRequests.appliedAt));

    return rows.map((r) => ({
      ...r.req,
      typeName: r.typeName,
      typeCode: r.typeCode,
      isPaid: r.isPaid,
      employeeCode: r.employeeCode,
      employeeName: `${r.firstName}${r.lastName ? ' ' + r.lastName : ''}`,
      employeePhotoUrl: r.photoUrl,
    }));
  }

  async create(input: CreateLeaveRequestInput) {
    // Validate employee + type belong to tenant
    const [emp] = await this.db
      .select({ id: employees.id })
      .from(employees)
      .where(and(eq(employees.id, input.employeeId), eq(employees.tenantId, this.tenantId)))
      .limit(1);
    if (!emp) throw new NotFoundError('Employee');

    const [type] = await this.db
      .select()
      .from(leaveTypes)
      .where(and(eq(leaveTypes.id, input.leaveTypeId), eq(leaveTypes.tenantId, this.tenantId)))
      .limit(1);
    if (!type) throw new NotFoundError('Leave type');
    // Retired type — existing requests stay valid, new ones don't.
    if (!type.isActive) throw new ConflictError(`${type.name} is no longer available`);

    if (input.halfDay && input.fromDate !== input.toDate) {
      throw new ConflictError('Half-day leave must be on a single date');
    }

    // Build holiday set + default weekly off (Sunday) for the date range's year
    const yearFrom = Number(input.fromDate.slice(0, 4));
    const yearTo = Number(input.toDate.slice(0, 4));
    const years = yearFrom === yearTo ? [yearFrom] : [yearFrom, yearTo];

    const holidayDates = await resolveHolidayDates(
      this.db, this.tenantId, `${years[0]}-01-01`, `${years[years.length - 1]}-12-31`,
    );

    const days = countLeaveDays(input.fromDate, input.toDate, {
      halfDay: input.halfDay,
      holidayDates,
      weeklyOffDays: await this.weeklyOffDaysFor(input.employeeId, input.fromDate),
    });

    if (days <= 0) {
      throw new ConflictError('Selected range has no working days (all holidays/week-offs)');
    }

    // Overlap check: any non-rejected/cancelled request that intersects?
    const overlap = await this.db
      .select({ id: leaveRequests.id })
      .from(leaveRequests)
      .where(and(
        eq(leaveRequests.tenantId, this.tenantId),
        eq(leaveRequests.employeeId, input.employeeId),
        inArray(leaveRequests.status, ['pending', 'approved']),
        lte(leaveRequests.fromDate, input.toDate),
        gte(leaveRequests.toDate, input.fromDate),
      ))
      .limit(1);
    if (overlap[0]) throw new ConflictError('Overlapping leave request exists');

    const [row] = await this.db
      .insert(leaveRequests)
      .values({
        tenantId: this.tenantId,
        employeeId: input.employeeId,
        leaveTypeId: input.leaveTypeId,
        fromDate: input.fromDate,
        toDate: input.toDate,
        halfDay: input.halfDay,
        days: String(days),
        reason: input.reason ?? null,
      })
      .returning();
    return row;
  }

  async getById(id: string) {
    const [row] = await this.db
      .select()
      .from(leaveRequests)
      .where(applyHrScope(this.scope, leaveRequests.employeeId,
        and(eq(leaveRequests.id, id), eq(leaveRequests.tenantId, this.tenantId))))
      .limit(1);
    // Out-of-scope rows look like not-found — never reveal forbidden ids.
    if (!row) throw new NotFoundError('Leave request');
    return row;
  }

  async review(id: string, input: ReviewLeaveRequestInput, reviewerId: string) {
    const req = await this.getById(id);
    if (req.status !== 'pending') throw new ConflictError('Request already reviewed');

    // Self-approval guard. Nobody approves or rejects their own leave —
    // separation of duties applies to HR / admins too, not just managers.
    // Managers (subset/self) carry selfEmployeeId on the scope for free;
    // org-wide (all) scopes resolve the reviewer's own employee row.
    const reviewerEmployeeId =
      this.scope.kind === 'subset' || this.scope.kind === 'self'
        ? this.scope.selfEmployeeId
        : await this.employeeIdForUser(reviewerId);
    if (reviewerEmployeeId && reviewerEmployeeId === req.employeeId) {
      throw new ConflictError('You cannot review your own leave request');
    }

    const status = input.approved ? 'approved' as const : 'rejected' as const;
    const [row] = await this.db
      .update(leaveRequests)
      .set({
        status,
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
        rejectionReason: input.approved ? null : input.rejectionReason ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(leaveRequests.id, id), eq(leaveRequests.tenantId, this.tenantId)))
      .returning();

    if (input.approved) {
      const year = Number(req.fromDate.slice(0, 4));
      const balSvc = new LeaveBalanceService(this.db, this.tenantId);
      const split = await this.splitPaidUnpaid(req);
      // Only the paid portion draws down the balance. Without the split the
      // balance simply goes negative, which reads as "quota exceeded" nowhere
      // and still pays the employee in full.
      await balSvc.incrementUsed(req.employeeId, req.leaveTypeId, year, split.paid);
      if (split.unpaid > 0) {
        await this.db
          .update(leaveRequests)
          .set({ unpaidDays: String(split.unpaid), updatedAt: new Date() })
          .where(eq(leaveRequests.id, id));
      }
      // Auto-mark attendance for approved leave days
      await this.markAttendanceForLeave(
        req.employeeId, req.fromDate, req.toDate, req.halfDay, split.unpaidDates,
      );
    }
    return row;
  }

  /**
   * How much of an approved request is paid vs unpaid. Only types flagged
   * `overflowUnpaid` split — everyone else keeps the old behaviour of drawing
   * the balance negative, so this is inert for tenants that haven't opted in.
   *
   * The paid days are the *earliest* ones in the range: an employee part-way
   * through their quota gets the front of the leave paid and the tail unpaid,
   * which is what both they and payroll expect.
   */
  private async splitPaidUnpaid(req: { id: string; employeeId: string; leaveTypeId: string; fromDate: string; toDate: string; halfDay: boolean; days: string }) {
    const days = Number(req.days);
    const [type] = await this.db
      .select({ overflowUnpaid: leaveTypes.overflowUnpaid })
      .from(leaveTypes)
      .where(and(eq(leaveTypes.id, req.leaveTypeId), eq(leaveTypes.tenantId, this.tenantId)))
      .limit(1);
    if (!type?.overflowUnpaid) return { paid: days, unpaid: 0, unpaidDates: [] as string[] };

    const paid = await this.payableDays(
      req.employeeId, req.leaveTypeId, req.fromDate, days, req.id,
    );
    const unpaid = Math.round((days - paid) * 100) / 100;
    if (unpaid <= 0) return { paid, unpaid: 0, unpaidDates: [] as string[] };

    // A half-day request is a single 0.5-day date — it can't be split, so it
    // lands wholly on whichever side the balance falls.
    if (req.halfDay) {
      return { paid, unpaid, unpaidDates: paid > 0 ? [] : [req.fromDate] };
    }
    const dates = await this.countedDatesFor(req.employeeId, req.fromDate, req.toDate);
    return { paid, unpaid, unpaidDates: dates.slice(Math.floor(paid)) };
  }

  /**
   * How many of `days` can be paid, given both limits a leave type can carry:
   *
   *   * the balance — what's been accrued and not yet spent
   *   * maxPaidDaysPerMonth — how much of that balance may be spent inside one
   *     calendar month
   *
   * The second exists because the first doesn't constrain timing: an employee
   * sitting on a full balance could take the lot at once, which is exactly
   * what a banked-leave cap is meant to prevent. A request is attributed to
   * the month it starts in.
   *
   * [excludeRequestId] keeps a request from counting against itself when it's
   * being re-priced.
   */
  private async payableDays(
    employeeId: string, leaveTypeId: string, fromDate: string, days: number,
    excludeRequestId?: string,
  ): Promise<number> {
    const available = await this.availableBalance(
      employeeId, leaveTypeId, Number(fromDate.slice(0, 4)),
    );
    let payable = Math.max(0, Math.min(days, available));

    const [type] = await this.db
      .select({ maxPaidDaysPerMonth: leaveTypes.maxPaidDaysPerMonth })
      .from(leaveTypes)
      .where(and(eq(leaveTypes.id, leaveTypeId), eq(leaveTypes.tenantId, this.tenantId)))
      .limit(1);
    const cap = type?.maxPaidDaysPerMonth != null ? Number(type.maxPaidDaysPerMonth) : null;
    if (cap == null) return payable;

    const monthStart = `${fromDate.slice(0, 7)}-01`;
    const nextMonth = new Date(Date.UTC(
      Number(fromDate.slice(0, 4)), Number(fromDate.slice(5, 7)), 1,
    )).toISOString().slice(0, 10);
    const [taken] = await this.db
      .select({
        // days − unpaid_days is what each earlier request actually drew as paid.
        paid: sql<string>`COALESCE(SUM(${leaveRequests.days} - ${leaveRequests.unpaidDays}), 0)`,
      })
      .from(leaveRequests)
      .where(and(
        eq(leaveRequests.tenantId, this.tenantId),
        eq(leaveRequests.employeeId, employeeId),
        eq(leaveRequests.leaveTypeId, leaveTypeId),
        eq(leaveRequests.status, 'approved'),
        gte(leaveRequests.fromDate, monthStart),
        sql`${leaveRequests.fromDate} < ${nextMonth}`,
        excludeRequestId ? sql`${leaveRequests.id} <> ${excludeRequestId}` : undefined,
      ));
    const alreadyPaid = Number(taken?.paid ?? 0);
    return Math.max(0, Math.min(payable, cap - alreadyPaid));
  }

  /// opening + accrued − used for one (employee, type, year). 0 when no row
  /// exists yet — an unprovisioned type has nothing to draw on.
  private async availableBalance(employeeId: string, leaveTypeId: string, year: number): Promise<number> {
    const [bal] = await this.db
      .select({
        opening: leaveBalances.opening,
        accrued: leaveBalances.accrued,
        used: leaveBalances.used,
      })
      .from(leaveBalances)
      .where(and(
        eq(leaveBalances.tenantId, this.tenantId),
        eq(leaveBalances.employeeId, employeeId),
        eq(leaveBalances.leaveTypeId, leaveTypeId),
        eq(leaveBalances.year, year),
      ))
      .limit(1);
    if (!bal) return 0;
    return Number(bal.opening) + Number(bal.accrued) - Number(bal.used);
  }

  /// The dates a request consumes, honouring the employee's week-offs and
  /// the tenant's holidays — the same set countLeaveDays() totals.
  private async countedDatesFor(employeeId: string, fromDate: string, toDate: string) {
    return countedLeaveDates(fromDate, toDate, {
      holidayDates: await resolveHolidayDates(this.db, this.tenantId, fromDate, toDate),
      weeklyOffDays: await this.weeklyOffDaysFor(employeeId, fromDate),
    });
  }

  /// Edit a pending request. Only mutates the fields supplied; recomputes
  /// `days` if dates or halfDay changed; re-checks the overlap window
  /// (excluding the row being edited). Frozen once status leaves
  /// 'pending' — the service throws and the caller surfaces the message.
  async update(id: string, input: UpdateLeaveRequestInput) {
    const req = await this.getById(id);
    if (req.status !== 'pending') {
      throw new ConflictError('Only pending requests can be edited');
    }

    const fromDate = input.fromDate ?? req.fromDate;
    const toDate = input.toDate ?? req.toDate;
    const halfDay = input.halfDay ?? req.halfDay;
    const leaveTypeId = input.leaveTypeId ?? req.leaveTypeId;

    // Validate type still belongs to tenant if it changed.
    if (input.leaveTypeId && input.leaveTypeId !== req.leaveTypeId) {
      const [type] = await this.db
        .select({ id: leaveTypes.id, name: leaveTypes.name, isActive: leaveTypes.isActive })
        .from(leaveTypes)
        .where(and(eq(leaveTypes.id, leaveTypeId), eq(leaveTypes.tenantId, this.tenantId)))
        .limit(1);
      if (!type) throw new NotFoundError('Leave type');
      if (!type.isActive) throw new ConflictError(`${type.name} is no longer available`);
    }

    if (halfDay && fromDate !== toDate) {
      throw new ConflictError('Half-day leave must be on a single date');
    }

    // Recompute days if dates / halfDay changed; otherwise reuse.
    let days = Number(req.days);
    if (input.fromDate || input.toDate || input.halfDay != null) {
      const holidayDates = await resolveHolidayDates(
        this.db, this.tenantId, fromDate, toDate);
      days = countLeaveDays(fromDate, toDate, {
        halfDay,
        holidayDates,
        weeklyOffDays: await this.weeklyOffDaysFor(req.employeeId, fromDate),
      });
      if (days <= 0) {
        throw new ConflictError('Selected range has no working days (all holidays/week-offs)');
      }
    }

    // Overlap check — only when the date window changed. Exclude self.
    if (input.fromDate || input.toDate) {
      const overlap = await this.db
        .select({ id: leaveRequests.id })
        .from(leaveRequests)
        .where(and(
          eq(leaveRequests.tenantId, this.tenantId),
          eq(leaveRequests.employeeId, req.employeeId),
          inArray(leaveRequests.status, ['pending', 'approved']),
          lte(leaveRequests.fromDate, toDate),
          gte(leaveRequests.toDate, fromDate),
          sql`${leaveRequests.id} <> ${id}`,
        ))
        .limit(1);
      if (overlap[0]) throw new ConflictError('Overlapping leave request exists');
    }

    const [row] = await this.db
      .update(leaveRequests)
      .set({
        leaveTypeId,
        fromDate,
        toDate,
        halfDay,
        days: String(days),
        reason: input.reason !== undefined ? input.reason : req.reason,
        updatedAt: new Date(),
      })
      .where(and(eq(leaveRequests.id, id), eq(leaveRequests.tenantId, this.tenantId)))
      .returning();
    return row;
  }

  async cancel(id: string) {
    const req = await this.getById(id);
    if (req.status === 'cancelled' || req.status === 'rejected') {
      throw new ConflictError('Already cancelled or rejected');
    }
    const [row] = await this.db
      .update(leaveRequests)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(and(eq(leaveRequests.id, id), eq(leaveRequests.tenantId, this.tenantId)))
      .returning();

    if (req.status === 'approved') {
      // Restore balance — only what was drawn from it. Handing back the full
      // days on a part-unpaid request would credit days that were never
      // deducted, quietly inflating the quota.
      const year = Number(req.fromDate.slice(0, 4));
      const paid = Number(req.days) - Number(req.unpaidDays ?? 0);
      const balSvc = new LeaveBalanceService(this.db, this.tenantId);
      await balSvc.incrementUsed(req.employeeId, req.leaveTypeId, year, -paid);
    }
    return row;
  }

  /**
   * What a request *would* cost before it's submitted: total days, how many
   * the balance covers, and how many would be unpaid. Backs the warning on
   * the apply screens so an employee finds out about a shortfall there, not
   * on their payslip. Read-only — nothing is written.
   */
  async preview(input: { employeeId: string; leaveTypeId: string; fromDate: string; toDate: string; halfDay: boolean }) {
    const year = Number(input.fromDate.slice(0, 4));
    const [type] = await this.db
      .select({ overflowUnpaid: leaveTypes.overflowUnpaid, name: leaveTypes.name })
      .from(leaveTypes)
      .where(and(eq(leaveTypes.id, input.leaveTypeId), eq(leaveTypes.tenantId, this.tenantId)))
      .limit(1);
    if (!type) throw new NotFoundError('Leave type');

    const days = input.halfDay
      ? 0.5
      : (await this.countedDatesFor(input.employeeId, input.fromDate, input.toDate)).length;
    const available = await this.availableBalance(input.employeeId, input.leaveTypeId, year);
    const paid = type.overflowUnpaid
      ? await this.payableDays(input.employeeId, input.leaveTypeId, input.fromDate, days)
      : days;
    return {
      days,
      available,
      paidDays: paid,
      unpaidDays: Math.round((days - paid) * 100) / 100,
      leaveTypeName: type.name,
    };
  }

  /// Week-offs for an employee on a given date. Shared with payroll's
  /// working-day count so the two can't disagree about which days are worked.
  private weeklyOffDaysFor(employeeId: string, onDate: string): Promise<number[]> {
    return resolveWeeklyOffDays(this.db, this.tenantId, employeeId, onDate);
  }

  /// Resolve a user id to its linked employee row — phone-match (last 10
  /// digits, country-code tolerant) with email as fallback, mirroring
  /// HrNotifier. Returns null when the account isn't tied to an employee
  /// (e.g. a CA / admin login), in which case there's no self to guard.
  private async employeeIdForUser(userId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ id: employees.id })
      .from(employees)
      .innerJoin(users, and(
        eq(users.id, userId),
        eq(users.tenantId, employees.tenantId),
        sql`(
          (coalesce(${users.phone}, '') <> ''
            AND right(regexp_replace(coalesce(${employees.phone}, ''), '\\D', '', 'g'), 10)
              = right(regexp_replace(coalesce(${users.phone}, ''), '\\D', '', 'g'), 10))
          OR (coalesce(${employees.email}, '') <> ''
            AND lower(${users.email}) = lower(${employees.email}))
        )`,
      ))
      .where(eq(employees.tenantId, this.tenantId))
      .limit(1);
    return row?.id ?? null;
  }

  private async markAttendanceForLeave(
    employeeId: string, fromDate: string, toDate: string, halfDay: boolean,
    /// Dates approved as unpaid. Marked `absent` rather than `leave` so
    /// payroll's existing LOP derivation (working − present − leave) deducts
    /// them, with no payroll-side knowledge of leave policy.
    unpaidDates: string[] = [],
  ) {
    const unpaid = new Set(unpaidDates);
    const start = new Date(fromDate + 'T00:00:00Z');
    const end = new Date(toDate + 'T00:00:00Z');
    for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      const status = unpaid.has(iso) ? 'absent' : halfDay ? 'half_day' : 'leave';
      await this.db
        .insert(attendance)
        .values({
          tenantId: this.tenantId,
          employeeId,
          date: iso,
          status,
          source: 'manual',
        })
        .onConflictDoUpdate({
          target: [attendance.employeeId, attendance.date],
          set: { status, updatedAt: new Date() },
        });
    }
  }
}
