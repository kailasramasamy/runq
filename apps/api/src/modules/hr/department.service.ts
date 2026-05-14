import { eq, and, asc, sql, isNull } from 'drizzle-orm';
import { departments, employees } from '@runq/db';
import type { Db } from '@runq/db';
import type { CreateDepartmentInput, UpdateDepartmentInput } from '@runq/validators';
import { NotFoundError, ConflictError } from '../../utils/errors';

export class DepartmentService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  async list() {
    const rows = await this.db
      .select({
        dept: departments,
        employeeCount: sql<number>`count(${employees.id})::int`,
      })
      .from(departments)
      .leftJoin(
        employees,
        and(eq(employees.departmentId, departments.id), isNull(employees.deletedAt)),
      )
      .where(eq(departments.tenantId, this.tenantId))
      .groupBy(departments.id)
      .orderBy(asc(departments.name));
    return rows.map((r) => ({ ...r.dept, employeeCount: Number(r.employeeCount ?? 0) }));
  }

  async create(input: CreateDepartmentInput) {
    const [existing] = await this.db
      .select({ id: departments.id })
      .from(departments)
      .where(and(eq(departments.tenantId, this.tenantId), eq(departments.name, input.name)))
      .limit(1);
    if (existing) throw new ConflictError('Department with this name already exists');

    const [row] = await this.db
      .insert(departments)
      .values({ tenantId: this.tenantId, ...input })
      .returning();
    return row;
  }

  async update(id: string, input: UpdateDepartmentInput) {
    const [row] = await this.db
      .update(departments)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(departments.id, id), eq(departments.tenantId, this.tenantId)))
      .returning();
    if (!row) throw new NotFoundError('Department');
    return row;
  }

  async remove(id: string) {
    const [used] = await this.db
      .select({ id: employees.id })
      .from(employees)
      .where(and(eq(employees.tenantId, this.tenantId), eq(employees.departmentId, id)))
      .limit(1);
    if (used) throw new ConflictError('Department is in use by employees');

    const [row] = await this.db
      .delete(departments)
      .where(and(eq(departments.id, id), eq(departments.tenantId, this.tenantId)))
      .returning();
    if (!row) throw new NotFoundError('Department');
    return row;
  }
}
