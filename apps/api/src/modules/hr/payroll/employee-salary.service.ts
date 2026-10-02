import { eq, and, isNull, or, gte, lte, desc, inArray, sql } from 'drizzle-orm';
import {
  employeeSalary, salaryStructureComponents, salaryComponents, employees, payrollRuns,
} from '@runq/db';
import type { Db } from '@runq/db';
import type { AssignEmployeeSalaryInput } from '@runq/validators';
import { ConflictError, NotFoundError } from '../../../utils/errors';

interface SnapshotComponent {
  componentId: string;
  code: string;
  name: string;
  type: string;
  calcType: string;
  value: number;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type SalarySpan = { id: string; effectiveFrom: string; effectiveTo: string | null };

/** ISO date one day before [iso]. */
function dayBefore(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * How existing assignments make room for a revision starting [from]. Rows
 * starting on or after it are superseded before they ever applied, so they
 * go; a row still running on [from] ends the day before. Rows that ended
 * earlier are history and stay untouched.
 */
export function planRevision(rows: SalarySpan[], from: string) {
  const remove = rows.filter((r) => r.effectiveFrom >= from).map((r) => r.id);
  const close = rows
    .filter((r) => r.effectiveFrom < from && (r.effectiveTo == null || r.effectiveTo >= from))
    .map((r) => ({ id: r.id, effectiveTo: dayBefore(from) }));
  return { remove, close };
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
      const existing = await tx
        .select({
          id: employeeSalary.id,
          effectiveFrom: employeeSalary.effectiveFrom,
          effectiveTo: employeeSalary.effectiveTo,
        })
        .from(employeeSalary)
        .where(and(
          eq(employeeSalary.tenantId, this.tenantId),
          eq(employeeSalary.employeeId, input.employeeId),
        ));
      const plan = planRevision(existing, input.effectiveFrom);
      // Only a change to an existing salary reprices past months; a first
      // assignment backdated to the joining date has nothing to reprice.
      if (plan.remove.length || plan.close.length) {
        await this.assertNotPaid(tx as unknown as Db, input.effectiveFrom);
      }
      if (plan.remove.length) {
        await tx.delete(employeeSalary).where(inArray(employeeSalary.id, plan.remove));
      }
      for (const c of plan.close) {
        await tx.update(employeeSalary).set({ effectiveTo: c.effectiveTo })
          .where(eq(employeeSalary.id, c.id));
      }

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

  /**
   * A revision reprices every payroll month from its start onwards. Months
   * already approved or closed have been paid, so they can't move under it.
   */
  private async assertNotPaid(db: Db, effectiveFrom: string) {
    const [y, m] = effectiveFrom.split('-').map(Number) as [number, number];
    const [paid] = await db
      .select({ month: payrollRuns.month, year: payrollRuns.year })
      .from(payrollRuns)
      .where(and(
        eq(payrollRuns.tenantId, this.tenantId),
        inArray(payrollRuns.status, ['approved', 'closed']),
        sql`${payrollRuns.year} * 12 + ${payrollRuns.month} >= ${y * 12 + m}`,
      ))
      .orderBy(desc(payrollRuns.year), desc(payrollRuns.month))
      .limit(1);
    if (paid) {
      const label = `${MONTHS[paid.month - 1]} ${paid.year}`;
      throw new ConflictError(
        `${label} payroll is already approved — start the new salary after that month`,
      );
    }
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
