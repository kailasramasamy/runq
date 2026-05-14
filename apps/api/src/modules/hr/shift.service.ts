import { eq, and, asc, desc } from 'drizzle-orm';
import { shifts, employeeShifts, employees } from '@runq/db';
import type { Db } from '@runq/db';
import type { CreateShiftInput, UpdateShiftInput, AssignShiftInput } from '@runq/validators';
import { NotFoundError } from '../../utils/errors';

export class ShiftService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  async list() {
    return this.db
      .select()
      .from(shifts)
      .where(eq(shifts.tenantId, this.tenantId))
      .orderBy(asc(shifts.startTime), asc(shifts.name));
  }

  async create(input: CreateShiftInput) {
    const [row] = await this.db
      .insert(shifts)
      .values({ tenantId: this.tenantId, ...input })
      .returning();
    return row;
  }

  async update(id: string, input: UpdateShiftInput) {
    const [row] = await this.db
      .update(shifts)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(shifts.id, id), eq(shifts.tenantId, this.tenantId)))
      .returning();
    if (!row) throw new NotFoundError('Shift');
    return row;
  }

  async remove(id: string) {
    const [row] = await this.db
      .delete(shifts)
      .where(and(eq(shifts.id, id), eq(shifts.tenantId, this.tenantId)))
      .returning();
    if (!row) throw new NotFoundError('Shift');
    return row;
  }

  async assign(input: AssignShiftInput) {
    const [emp] = await this.db
      .select({ id: employees.id })
      .from(employees)
      .where(and(eq(employees.id, input.employeeId), eq(employees.tenantId, this.tenantId)))
      .limit(1);
    if (!emp) throw new NotFoundError('Employee');

    const [row] = await this.db
      .insert(employeeShifts)
      .values({ tenantId: this.tenantId, ...input })
      .returning();
    return row;
  }

  async listAssignments(employeeId: string) {
    return this.db
      .select({ assign: employeeShifts, shift: shifts })
      .from(employeeShifts)
      .innerJoin(shifts, eq(shifts.id, employeeShifts.shiftId))
      .where(and(
        eq(employeeShifts.tenantId, this.tenantId),
        eq(employeeShifts.employeeId, employeeId),
      ))
      .orderBy(desc(employeeShifts.effectiveFrom));
  }
}
