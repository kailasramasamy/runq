import { eq, and, asc } from 'drizzle-orm';
import { leaveTypes, leaveRequests } from '@runq/db';
import type { Db } from '@runq/db';
import type { CreateLeaveTypeInput, UpdateLeaveTypeInput } from '@runq/validators';
import { NotFoundError, ConflictError } from '../../utils/errors';

const DEFAULT_TYPES = [
  { name: 'Casual Leave', code: 'CL', daysPerYear: 12, carryForward: false, isPaid: true },
  { name: 'Sick Leave', code: 'SL', daysPerYear: 12, carryForward: false, isPaid: true },
  { name: 'Earned Leave', code: 'EL', daysPerYear: 15, carryForward: true, maxCarryForward: 45, encashable: true, isPaid: true },
  { name: 'Maternity Leave', code: 'ML', daysPerYear: 182, carryForward: false, isPaid: true },
  { name: 'Compensatory Off', code: 'CO', daysPerYear: 0, carryForward: true, maxCarryForward: 12, isPaid: true },
  { name: 'Loss of Pay', code: 'LOP', daysPerYear: 0, carryForward: false, isPaid: false },
];

export class LeaveTypeService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  async list() {
    return this.db
      .select()
      .from(leaveTypes)
      .where(eq(leaveTypes.tenantId, this.tenantId))
      .orderBy(asc(leaveTypes.code));
  }

  async create(input: CreateLeaveTypeInput) {
    const dup = await this.db
      .select({ id: leaveTypes.id })
      .from(leaveTypes)
      .where(and(eq(leaveTypes.tenantId, this.tenantId), eq(leaveTypes.code, input.code)))
      .limit(1);
    if (dup[0]) throw new ConflictError('Leave type code already exists');

    const [row] = await this.db
      .insert(leaveTypes)
      .values({ tenantId: this.tenantId, ...this.serialize(input) } as any)
      .returning();
    return row;
  }

  async update(id: string, input: UpdateLeaveTypeInput) {
    const [row] = await this.db
      .update(leaveTypes)
      .set({ ...this.serialize(input), updatedAt: new Date() } as any)
      .where(and(eq(leaveTypes.id, id), eq(leaveTypes.tenantId, this.tenantId)))
      .returning();
    if (!row) throw new NotFoundError('Leave type');
    return row;
  }

  async remove(id: string) {
    const [used] = await this.db
      .select({ id: leaveRequests.id })
      .from(leaveRequests)
      .where(and(eq(leaveRequests.tenantId, this.tenantId), eq(leaveRequests.leaveTypeId, id)))
      .limit(1);
    if (used) throw new ConflictError('Leave type is in use by requests');

    const [row] = await this.db
      .delete(leaveTypes)
      .where(and(eq(leaveTypes.id, id), eq(leaveTypes.tenantId, this.tenantId)))
      .returning();
    if (!row) throw new NotFoundError('Leave type');
    return row;
  }

  async seedDefaults() {
    const existing = await this.list();
    if (existing.length > 0) return { skipped: true, count: existing.length };
    let created = 0;
    for (const t of DEFAULT_TYPES) {
      await this.db.insert(leaveTypes).values({
        tenantId: this.tenantId,
        name: t.name,
        code: t.code,
        daysPerYear: String(t.daysPerYear),
        carryForward: t.carryForward,
        maxCarryForward: t.maxCarryForward != null ? String(t.maxCarryForward) : null,
        encashable: t.encashable ?? false,
        isPaid: t.isPaid,
      });
      created++;
    }
    return { skipped: false, count: created };
  }

  private serialize(input: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = { ...input };
    if (out.daysPerYear != null) out.daysPerYear = String(out.daysPerYear);
    if (out.maxCarryForward != null) out.maxCarryForward = String(out.maxCarryForward);
    return out;
  }
}
