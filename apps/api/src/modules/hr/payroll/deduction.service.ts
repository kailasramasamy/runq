import { eq, and, desc } from 'drizzle-orm';
import {
  employeeDeductions, employeeDeductionRecoveries, employeeLoans,
  employees, payrollRuns,
} from '@runq/db';
import type { Db } from '@runq/db';
import type {
  CreateEmployeeDeductionInput, UpdateEmployeeDeductionInput,
  ListEmployeeDeductionsInput,
} from '@runq/validators';
import { NotFoundError, ConflictError } from '../../../utils/errors';

const r2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Ad-hoc amounts owed by employees — goods bought from the company, canteen,
 * damages — that payroll recovers alongside loan EMIs.
 *
 * Kept apart from `employeeLoans` on purpose: a loan is a promise with a
 * schedule an employee agreed to and can see up front, while these are debts
 * raised after the fact. They share the payroll recovery engine but nothing
 * else.
 */
export class EmployeeDeductionService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  async list(filter: ListEmployeeDeductionsInput) {
    const conds = [eq(employeeDeductions.tenantId, this.tenantId)];
    if (filter.employeeId) conds.push(eq(employeeDeductions.employeeId, filter.employeeId));
    if (filter.status) conds.push(eq(employeeDeductions.status, filter.status));

    return this.db
      .select({
        id: employeeDeductions.id,
        employeeId: employeeDeductions.employeeId,
        firstName: employees.firstName,
        lastName: employees.lastName,
        employeeCode: employees.employeeCode,
        category: employeeDeductions.category,
        description: employeeDeductions.description,
        amount: employeeDeductions.amount,
        instalment: employeeDeductions.instalment,
        outstanding: employeeDeductions.outstanding,
        startMonth: employeeDeductions.startMonth,
        startYear: employeeDeductions.startYear,
        status: employeeDeductions.status,
        createdAt: employeeDeductions.createdAt,
      })
      .from(employeeDeductions)
      .innerJoin(employees, eq(employees.id, employeeDeductions.employeeId))
      .where(and(...conds))
      .orderBy(desc(employeeDeductions.createdAt));
  }

  /** A deduction plus the runs that have chipped away at it. */
  async getById(id: string) {
    const [row] = await this.db
      .select()
      .from(employeeDeductions)
      .where(and(eq(employeeDeductions.id, id), eq(employeeDeductions.tenantId, this.tenantId)))
      .limit(1);
    if (!row) throw new NotFoundError('Deduction');

    const recoveries = await this.db
      .select({
        id: employeeDeductionRecoveries.id,
        amount: employeeDeductionRecoveries.amount,
        payrollRunId: employeeDeductionRecoveries.payrollRunId,
        month: payrollRuns.month,
        year: payrollRuns.year,
      })
      .from(employeeDeductionRecoveries)
      .innerJoin(payrollRuns, eq(payrollRuns.id, employeeDeductionRecoveries.payrollRunId))
      .where(eq(employeeDeductionRecoveries.deductionId, id))
      .orderBy(desc(payrollRuns.year), desc(payrollRuns.month));

    return { ...row, recoveries };
  }

  async create(input: CreateEmployeeDeductionInput, userId: string) {
    const [emp] = await this.db
      .select({ id: employees.id })
      .from(employees)
      .where(and(eq(employees.id, input.employeeId), eq(employees.tenantId, this.tenantId)))
      .limit(1);
    if (!emp) throw new NotFoundError('Employee');

    const amount = r2(input.amount);
    // No instalment given means recover it whole from the next run.
    const instalment = r2(Math.min(input.instalment ?? amount, amount));

    const [row] = await this.db
      .insert(employeeDeductions)
      .values({
        tenantId: this.tenantId,
        employeeId: input.employeeId,
        category: input.category,
        description: input.description ?? null,
        amount: String(amount),
        instalment: String(instalment),
        outstanding: String(amount),
        startMonth: input.startMonth,
        startYear: input.startYear,
        createdBy: userId,
      })
      .returning();
    return row;
  }

  /**
   * Edit the terms, never the money. Amount and outstanding are deliberately
   * not updatable — once payroll has recovered against a deduction, changing
   * its face value would silently rewrite what an employee already paid. To
   * correct a wrong amount, cancel it and raise a new one.
   */
  async update(id: string, input: UpdateEmployeeDeductionInput) {
    const existing = await this.getById(id);
    if (existing.status !== 'active') {
      throw new ConflictError('Only an active deduction can be edited');
    }
    const instalment = input.instalment === undefined
      ? undefined
      : String(r2(Math.min(input.instalment, Number(existing.outstanding))));

    const [row] = await this.db
      .update(employeeDeductions)
      .set({
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.description !== undefined ? { description: input.description ?? null } : {}),
        ...(instalment !== undefined ? { instalment } : {}),
        ...(input.startMonth !== undefined ? { startMonth: input.startMonth } : {}),
        ...(input.startYear !== undefined ? { startYear: input.startYear } : {}),
        updatedAt: new Date(),
      })
      .where(eq(employeeDeductions.id, id))
      .returning();
    return row;
  }

  /**
   * Stop recovering. Cancelling leaves past recoveries alone — that money was
   * genuinely taken off payslips and the ledger should still say so.
   */
  async cancel(id: string) {
    const existing = await this.getById(id);
    if (existing.status === 'cancelled') throw new ConflictError('Already cancelled');
    const [row] = await this.db
      .update(employeeDeductions)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(employeeDeductions.id, id))
      .returning();
    return row;
  }

  /** Only ever removable while untouched; recovered money must leave a trail. */
  async remove(id: string) {
    const existing = await this.getById(id);
    if (existing.recoveries.length > 0) {
      throw new ConflictError('Payroll has already recovered against this — cancel it instead');
    }
    await this.db
      .delete(employeeDeductions)
      .where(and(eq(employeeDeductions.id, id), eq(employeeDeductions.tenantId, this.tenantId)));
    return { id };
  }

  /**
   * Everything one employee currently owes, for the "what comes off my pay
   * next month" view on mobile and the employee detail page on web.
   */
  async recoverySummary(employeeId: string) {
    const loans = await this.db
      .select()
      .from(employeeLoans)
      .where(and(
        eq(employeeLoans.tenantId, this.tenantId),
        eq(employeeLoans.employeeId, employeeId),
        eq(employeeLoans.status, 'active'),
      ))
      .orderBy(employeeLoans.disbursedOn);

    const deductions = await this.db
      .select()
      .from(employeeDeductions)
      .where(and(
        eq(employeeDeductions.tenantId, this.tenantId),
        eq(employeeDeductions.employeeId, employeeId),
        eq(employeeDeductions.status, 'active'),
      ))
      .orderBy(employeeDeductions.createdAt);

    const loanOutstanding = loans.reduce((s, l) => s + Number(l.outstanding), 0);
    const dedOutstanding = deductions.reduce((s, d) => s + Number(d.outstanding), 0);
    // What next payroll would take if net pay can absorb all of it.
    const nextRunEstimate = loans.reduce((s, l) => s + Math.min(Number(l.emiAmount), Number(l.outstanding)), 0)
      + deductions.reduce((s, d) => s + Math.min(Number(d.instalment), Number(d.outstanding)), 0);

    return {
      loans,
      deductions,
      loanOutstanding: r2(loanOutstanding),
      deductionOutstanding: r2(dedOutstanding),
      totalOutstanding: r2(loanOutstanding + dedOutstanding),
      nextRunEstimate: r2(nextRunEstimate),
    };
  }
}
