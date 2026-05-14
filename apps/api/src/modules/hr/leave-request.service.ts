import { eq, and, gte, lte, desc, inArray, sql } from 'drizzle-orm';
import {
  leaveRequests, leaveTypes, leaveBalances, employees, holidays, attendance,
} from '@runq/db';
import type { Db } from '@runq/db';
import type {
  CreateLeaveRequestInput, ReviewLeaveRequestInput, LeaveRequestFilter,
} from '@runq/validators';
import { NotFoundError, ConflictError } from '../../utils/errors';
import { countLeaveDays } from './leave-days';
import { LeaveBalanceService } from './leave-balance.service';

export class LeaveRequestService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  async list(filter: LeaveRequestFilter) {
    const where = and(
      eq(leaveRequests.tenantId, this.tenantId),
      filter.employeeId ? eq(leaveRequests.employeeId, filter.employeeId) : undefined,
      filter.leaveTypeId ? eq(leaveRequests.leaveTypeId, filter.leaveTypeId) : undefined,
      filter.status ? eq(leaveRequests.status, filter.status) : undefined,
      filter.dateFrom ? gte(leaveRequests.fromDate, filter.dateFrom) : undefined,
      filter.dateTo ? lte(leaveRequests.toDate, filter.dateTo) : undefined,
    );

    const rows = await this.db
      .select({
        req: leaveRequests,
        typeName: leaveTypes.name,
        typeCode: leaveTypes.code,
        isPaid: leaveTypes.isPaid,
        employeeCode: employees.employeeCode,
        firstName: employees.firstName,
        lastName: employees.lastName,
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

    if (input.halfDay && input.fromDate !== input.toDate) {
      throw new ConflictError('Half-day leave must be on a single date');
    }

    // Build holiday set + default weekly off (Sunday) for the date range's year
    const yearFrom = Number(input.fromDate.slice(0, 4));
    const yearTo = Number(input.toDate.slice(0, 4));
    const years = yearFrom === yearTo ? [yearFrom] : [yearFrom, yearTo];

    const holidayRows = await this.db
      .select({ date: holidays.date })
      .from(holidays)
      .where(and(
        eq(holidays.tenantId, this.tenantId),
        inArray(
          sql`EXTRACT(YEAR FROM ${holidays.date})::int`,
          years,
        ),
      ));
    const holidayDates = new Set(holidayRows.map((r) => r.date));

    const days = countLeaveDays(input.fromDate, input.toDate, {
      halfDay: input.halfDay,
      holidayDates,
      weeklyOffDays: [0], // Sunday default; per-employee shift handling deferred
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
      .where(and(eq(leaveRequests.id, id), eq(leaveRequests.tenantId, this.tenantId)))
      .limit(1);
    if (!row) throw new NotFoundError('Leave request');
    return row;
  }

  async review(id: string, input: ReviewLeaveRequestInput, reviewerId: string) {
    const req = await this.getById(id);
    if (req.status !== 'pending') throw new ConflictError('Request already reviewed');

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
      await balSvc.incrementUsed(req.employeeId, req.leaveTypeId, year, Number(req.days));
      // Auto-mark attendance for approved leave days
      await this.markAttendanceForLeave(req.employeeId, req.fromDate, req.toDate, req.halfDay);
    }
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
      // Restore balance
      const year = Number(req.fromDate.slice(0, 4));
      const balSvc = new LeaveBalanceService(this.db, this.tenantId);
      await balSvc.incrementUsed(req.employeeId, req.leaveTypeId, year, -Number(req.days));
    }
    return row;
  }

  private async markAttendanceForLeave(
    employeeId: string, fromDate: string, toDate: string, halfDay: boolean,
  ) {
    const start = new Date(fromDate + 'T00:00:00Z');
    const end = new Date(toDate + 'T00:00:00Z');
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      await this.db
        .insert(attendance)
        .values({
          tenantId: this.tenantId,
          employeeId,
          date: iso,
          status: halfDay ? 'half_day' : 'leave',
          source: 'manual',
        })
        .onConflictDoUpdate({
          target: [attendance.employeeId, attendance.date],
          set: {
            status: halfDay ? 'half_day' : 'leave',
            updatedAt: new Date(),
          },
        });
    }
  }
}
