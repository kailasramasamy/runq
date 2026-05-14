import { eq, and, isNull, or, gte, lte, desc } from 'drizzle-orm';
import {
  employeeSalary, salaryStructureComponents, salaryComponents, employees,
} from '@runq/db';
import type { Db } from '@runq/db';
import type { AssignEmployeeSalaryInput } from '@runq/validators';
import { NotFoundError } from '../../../utils/errors';

interface SnapshotComponent {
  componentId: string;
  code: string;
  name: string;
  type: string;
  calcType: string;
  value: number;
}

export class EmployeeSalaryService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  /** Latest active salary assignment for an employee as of a given date. */
  async getCurrent(employeeId: string, asOf: string) {
    const [row] = await this.db
      .select()
      .from(employeeSalary)
      .where(and(
        eq(employeeSalary.tenantId, this.tenantId),
        eq(employeeSalary.employeeId, employeeId),
        lte(employeeSalary.effectiveFrom, asOf),
        or(isNull(employeeSalary.effectiveTo), gte(employeeSalary.effectiveTo, asOf)),
      ))
      .orderBy(desc(employeeSalary.effectiveFrom))
      .limit(1);
    return row ?? null;
  }

  async listForEmployee(employeeId: string) {
    return this.db
      .select()
      .from(employeeSalary)
      .where(and(
        eq(employeeSalary.tenantId, this.tenantId),
        eq(employeeSalary.employeeId, employeeId),
      ))
      .orderBy(desc(employeeSalary.effectiveFrom));
  }

  async assign(input: AssignEmployeeSalaryInput) {
    const [emp] = await this.db
      .select({ id: employees.id })
      .from(employees)
      .where(and(eq(employees.id, input.employeeId), eq(employees.tenantId, this.tenantId)))
      .limit(1);
    if (!emp) throw new NotFoundError('Employee');

    const snapshot: SnapshotComponent[] = input.salaryStructureId
      ? await this.snapshotStructure(input.salaryStructureId)
      : [];

    return this.db.transaction(async (tx) => {
      // Close out any current assignment by setting effective_to to (effective_from - 1 day)
      const dayBefore = new Date(input.effectiveFrom + 'T00:00:00Z');
      dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
      const closeIso = dayBefore.toISOString().slice(0, 10);

      await tx
        .update(employeeSalary)
        .set({ effectiveTo: closeIso })
        .where(and(
          eq(employeeSalary.tenantId, this.tenantId),
          eq(employeeSalary.employeeId, input.employeeId),
          isNull(employeeSalary.effectiveTo),
        ));

      const [row] = await tx.insert(employeeSalary).values({
        tenantId: this.tenantId,
        employeeId: input.employeeId,
        salaryStructureId: input.salaryStructureId ?? null,
        ctcAnnual: String(input.ctcAnnual),
        effectiveFrom: input.effectiveFrom,
        componentsSnapshot: snapshot,
      }).returning();

      // Mirror CTC on employees table for at-a-glance display
      await tx
        .update(employees)
        .set({ ctcAnnual: String(input.ctcAnnual), updatedAt: new Date() })
        .where(and(eq(employees.id, input.employeeId), eq(employees.tenantId, this.tenantId)));

      return row;
    });
  }

  /** Build a snapshot of structure components, joined with master data. */
  async snapshotStructure(structureId: string): Promise<SnapshotComponent[]> {
    const rows = await this.db
      .select({
        componentId: salaryComponents.id,
        code: salaryComponents.code,
        name: salaryComponents.name,
        type: salaryComponents.type,
        calcType: salaryStructureComponents.calcType,
        value: salaryStructureComponents.value,
      })
      .from(salaryStructureComponents)
      .innerJoin(salaryComponents, eq(salaryComponents.id, salaryStructureComponents.salaryComponentId))
      .where(and(
        eq(salaryStructureComponents.salaryStructureId, structureId),
        eq(salaryStructureComponents.tenantId, this.tenantId),
      ));
    return rows.map((r) => ({
      componentId: r.componentId,
      code: r.code,
      name: r.name,
      type: r.type,
      calcType: r.calcType,
      value: Number(r.value),
    }));
  }
}
