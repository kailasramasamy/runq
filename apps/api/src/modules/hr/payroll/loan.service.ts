import { eq, and, sql, asc, gt } from 'drizzle-orm';
import {
  employeeLoans, employeeLoanInstalments, employeePayments,
} from '@runq/db';
import type { Db } from '@runq/db';
import type { UpdateLoanInput, WriteOffLoanInput } from '@runq/validators';
import { NotFoundError, ConflictError } from '../../../utils/errors';

const r2 = (n: number): number => Math.round(n * 100) / 100;

type LoanRow = typeof employeeLoans.$inferSelect;

/**
 * Editing and retiring advances/loans after they exist.
 *
 * The governing rule throughout: money payroll has already recovered, and cash
 * already disbursed, are history. An edit may reshape what is still owed —
 * never rewrite what already happened.
 */
export class EmployeeLoanService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  private async load(id: string): Promise<LoanRow> {
    const [loan] = await this.db
      .select()
      .from(employeeLoans)
      .where(and(eq(employeeLoans.id, id), eq(employeeLoans.tenantId, this.tenantId)))
      .limit(1);
    if (!loan) throw new NotFoundError('Loan');
    return loan;
  }

  /** Sum already taken off payslips. The floor under any edit. */
  private async recoveredSoFar(loanId: string): Promise<number> {
    const [row] = await this.db
      .select({ total: sql<string>`coalesce(sum(${employeeLoanInstalments.paidAmount}), 0)` })
      .from(employeeLoanInstalments)
      .where(eq(employeeLoanInstalments.loanId, loanId));
    return r2(Number(row?.total ?? 0));
  }

  private async isDisbursed(loanId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: employeePayments.id })
      .from(employeePayments)
      .where(and(
        eq(employeePayments.tenantId, this.tenantId),
        eq(employeePayments.employeeLoanId, loanId),
        eq(employeePayments.status, 'paid'),
      ))
      .limit(1);
    return Boolean(row);
  }

  /**
   * Reshape an advance. Changing the principal is only on the table while the
   * cash hasn't moved and payroll hasn't recovered anything — after either,
   * the amount is a fact about the past. The repayment plan stays editable
   * throughout, because "spread the rest over more months" is the request
   * people actually make.
   */
  async update(id: string, input: UpdateLoanInput) {
    const loan = await this.load(id);
    if (loan.status !== 'draft' && loan.status !== 'requested'
      && loan.status !== 'manager_approved' && loan.status !== 'active') {
      throw new ConflictError(`A ${loan.status.replace('_', ' ')} loan can't be edited`);
    }

    const recovered = await this.recoveredSoFar(id);
    let principal = Number(loan.principal);

    if (input.principal !== undefined && r2(input.principal) !== principal) {
      if (recovered > 0) {
        throw new ConflictError(
          `Payroll has already recovered ₹${recovered.toLocaleString('en-IN')} against this — the amount can no longer be changed`,
        );
      }
      if (await this.isDisbursed(id)) {
        throw new ConflictError('This advance is already paid out — the amount can no longer be changed');
      }
      principal = r2(input.principal);
    }

    const outstanding = r2(principal - recovered);
    if (outstanding < 0) {
      throw new ConflictError('Amount is below what has already been recovered');
    }
    await this.rebuildSchedule(loan, input, outstanding);

    const [row] = await this.db
      .update(employeeLoans)
      .set({
        principal: String(principal),
        outstanding: String(outstanding),
        ...(input.reason !== undefined ? { reason: input.reason ?? null } : {}),
        ...(outstanding <= 0
          ? { status: 'closed' as const, closedAt: new Date() }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(employeeLoans.id, id))
      .returning();
    return row;
  }

  /**
   * Redraw the unpaid tail of the EMI schedule, leaving settled instalments
   * untouched. A part-paid instalment counts as settled for its paid portion,
   * so it is left alone and the remainder rides in the new plan.
   */
  private async rebuildSchedule(
    loan: LoanRow, input: UpdateLoanInput, outstanding: number,
  ): Promise<void> {
    const planChanged = input.remainingInstalments !== undefined
      || input.firstEmiMonth !== undefined
      || input.firstEmiYear !== undefined
      || input.principal !== undefined;
    if (!planChanged || outstanding <= 0) {
      if (outstanding <= 0) {
        await this.db
          .delete(employeeLoanInstalments)
          .where(and(
            eq(employeeLoanInstalments.loanId, loan.id),
            eq(employeeLoanInstalments.paidAmount, '0'),
          ));
      }
      return;
    }

    const settled = await this.db
      .select()
      .from(employeeLoanInstalments)
      .where(and(
        eq(employeeLoanInstalments.loanId, loan.id),
        gt(employeeLoanInstalments.paidAmount, '0'),
      ))
      .orderBy(asc(employeeLoanInstalments.sequence));

    await this.db
      .delete(employeeLoanInstalments)
      .where(and(
        eq(employeeLoanInstalments.loanId, loan.id),
        eq(employeeLoanInstalments.paidAmount, '0'),
      ));

    const n = input.remainingInstalments
      ?? Math.max(1, loan.totalInstalments - settled.length);
    const emi = r2(outstanding / n);
    // Last instalment absorbs the rounding drift so the plan foots exactly.
    const last = r2(outstanding - emi * (n - 1));

    let month = input.firstEmiMonth ?? loan.firstEmiMonth;
    let year = input.firstEmiYear ?? loan.firstEmiYear;
    let sequence = settled.length;

    const rows: typeof employeeLoanInstalments.$inferInsert[] = [];
    for (let i = 1; i <= n; i++) {
      sequence += 1;
      rows.push({
        tenantId: this.tenantId,
        loanId: loan.id,
        sequence,
        dueMonth: month,
        dueYear: year,
        amount: String(i === n ? last : emi),
      });
      month += 1;
      if (month > 12) { month = 1; year += 1; }
    }
    if (rows.length) await this.db.insert(employeeLoanInstalments).values(rows);

    await this.db
      .update(employeeLoans)
      .set({
        emiAmount: String(emi),
        totalInstalments: settled.length + n,
        firstEmiMonth: settled.length === 0 ? (input.firstEmiMonth ?? loan.firstEmiMonth) : loan.firstEmiMonth,
        firstEmiYear: settled.length === 0 ? (input.firstEmiYear ?? loan.firstEmiYear) : loan.firstEmiYear,
      })
      .where(eq(employeeLoans.id, loan.id));
  }

  /**
   * Delete outright — only ever for an advance that never happened.
   *
   * Once cash has gone out or payroll has taken a rupee back, deleting would
   * strand a journal entry against 1122 with nothing to explain it, and erase
   * a recovery the employee can see on their payslip. Those cases write off.
   */
  async remove(id: string) {
    const loan = await this.load(id);
    const recovered = await this.recoveredSoFar(id);
    if (recovered > 0) {
      throw new ConflictError(
        'Payroll has already recovered against this — write it off instead of deleting',
      );
    }
    if (await this.isDisbursed(id)) {
      throw new ConflictError(
        'This advance is already paid out and posted to the books — write it off instead of deleting',
      );
    }
    await this.db
      .delete(employeeLoanInstalments)
      .where(eq(employeeLoanInstalments.loanId, id));
    const [row] = await this.db
      .delete(employeeLoans)
      .where(and(eq(employeeLoans.id, id), eq(employeeLoans.tenantId, this.tenantId)))
      .returning();
    return row;
  }

  /**
   * Stop recovering, keep the history. The remaining balance is given up on;
   * instalments already paid stay exactly as they were.
   */
  async writeOff(id: string, input: WriteOffLoanInput) {
    const loan = await this.load(id);
    if (loan.status === 'written_off') throw new ConflictError('Already written off');
    if (loan.status === 'closed') throw new ConflictError('This loan is already fully repaid');

    await this.db
      .delete(employeeLoanInstalments)
      .where(and(
        eq(employeeLoanInstalments.loanId, id),
        eq(employeeLoanInstalments.paidAmount, '0'),
      ));

    const [row] = await this.db
      .update(employeeLoans)
      .set({
        status: 'written_off',
        outstanding: '0',
        closedAt: new Date(),
        reason: input.reason ?? loan.reason,
        updatedAt: new Date(),
      })
      .where(eq(employeeLoans.id, id))
      .returning();
    return row;
  }
}
