import { eq, and, sql } from 'drizzle-orm';
import { leaveBalances, leaveTypes, employees } from '@runq/db';
import type { Db } from '@runq/db';
import type { AdjustLeaveBalanceInput } from '@runq/validators';
import { NotFoundError } from '../../utils/errors';

export class LeaveBalanceService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  /**
   * Ensures a balance row exists for (employee, leaveType, year). Initializes
   * `accrued` to the leave type's daysPerYear if creating.
   */
  async ensure(employeeId: string, leaveTypeId: string, year: number) {
    const [existing] = await this.db
      .select()
      .from(leaveBalances)
      .where(and(
        eq(leaveBalances.tenantId, this.tenantId),
        eq(leaveBalances.employeeId, employeeId),
        eq(leaveBalances.leaveTypeId, leaveTypeId),
        eq(leaveBalances.year, year),
      ))
      .limit(1);
    if (existing) return existing;

    const [type] = await this.db
      .select({ daysPerYear: leaveTypes.daysPerYear })
      .from(leaveTypes)
      .where(and(eq(leaveTypes.id, leaveTypeId), eq(leaveTypes.tenantId, this.tenantId)))
      .limit(1);
    if (!type) throw new NotFoundError('Leave type');

    const [row] = await this.db.insert(leaveBalances).values({
      tenantId: this.tenantId,
      employeeId,
      leaveTypeId,
      year,
      opening: '0',
      accrued: type.daysPerYear,
      used: '0',
    }).returning();
    return row;
  }

  async list(filter: { employeeId?: string; year?: number }) {
    const conditions = [eq(leaveBalances.tenantId, this.tenantId)];
    if (filter.employeeId) conditions.push(eq(leaveBalances.employeeId, filter.employeeId));
    if (filter.year) conditions.push(eq(leaveBalances.year, filter.year));

    const rows = await this.db
      .select({
        bal: leaveBalances,
        typeName: leaveTypes.name,
        typeCode: leaveTypes.code,
        firstName: employees.firstName,
        lastName: employees.lastName,
        employeeCode: employees.employeeCode,
      })
      .from(leaveBalances)
      .innerJoin(leaveTypes, eq(leaveTypes.id, leaveBalances.leaveTypeId))
      .innerJoin(employees, eq(employees.id, leaveBalances.employeeId))
      .where(and(...conditions));

    return rows.map((r) => ({
      ...r.bal,
      typeName: r.typeName,
      typeCode: r.typeCode,
      employeeCode: r.employeeCode,
      employeeName: `${r.firstName}${r.lastName ? ' ' + r.lastName : ''}`,
      balance: Number(r.bal.opening) + Number(r.bal.accrued) - Number(r.bal.used),
    }));
  }

  async adjust(input: AdjustLeaveBalanceInput) {
    await this.ensure(input.employeeId, input.leaveTypeId, input.year);
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (input.opening != null) updates.opening = String(input.opening);
    if (input.accrued != null) updates.accrued = String(input.accrued);

    const [row] = await this.db
      .update(leaveBalances)
      .set(updates)
      .where(and(
        eq(leaveBalances.tenantId, this.tenantId),
        eq(leaveBalances.employeeId, input.employeeId),
        eq(leaveBalances.leaveTypeId, input.leaveTypeId),
        eq(leaveBalances.year, input.year),
      ))
      .returning();
    return row;
  }

  async incrementUsed(employeeId: string, leaveTypeId: string, year: number, deltaDays: number) {
    await this.ensure(employeeId, leaveTypeId, year);
    await this.db
      .update(leaveBalances)
      .set({
        used: sql`${leaveBalances.used} + ${String(deltaDays)}`,
        updatedAt: new Date(),
      })
      .where(and(
        eq(leaveBalances.tenantId, this.tenantId),
        eq(leaveBalances.employeeId, employeeId),
        eq(leaveBalances.leaveTypeId, leaveTypeId),
        eq(leaveBalances.year, year),
      ));
  }

  async carryForward(fromYear: number, toYear: number) {
    // Move (used-adjusted) balance into next year's opening, capped by maxCarryForward
    const rows = await this.db
      .select({
        bal: leaveBalances,
        carryForward: leaveTypes.carryForward,
        maxCarryForward: leaveTypes.maxCarryForward,
      })
      .from(leaveBalances)
      .innerJoin(leaveTypes, eq(leaveTypes.id, leaveBalances.leaveTypeId))
      .where(and(
        eq(leaveBalances.tenantId, this.tenantId),
        eq(leaveBalances.year, fromYear),
      ));

    let moved = 0;
    for (const r of rows) {
      if (!r.carryForward) continue;
      const remaining = Math.max(
        0,
        Number(r.bal.opening) + Number(r.bal.accrued) - Number(r.bal.used),
      );
      const cap = r.maxCarryForward != null ? Number(r.maxCarryForward) : remaining;
      const opening = Math.min(remaining, cap);
      if (opening <= 0) continue;

      await this.db
        .insert(leaveBalances)
        .values({
          tenantId: this.tenantId,
          employeeId: r.bal.employeeId,
          leaveTypeId: r.bal.leaveTypeId,
          year: toYear,
          opening: String(opening),
          accrued: '0',
          used: '0',
        })
        .onConflictDoUpdate({
          target: [leaveBalances.employeeId, leaveBalances.leaveTypeId, leaveBalances.year],
          set: { opening: String(opening), updatedAt: new Date() },
        });
      moved++;
    }
    return { moved };
  }
}
