import { eq, and, desc, sql } from 'drizzle-orm';
import {
  employeePayments, payrollRuns, payslips, expenseClaims, employeeRewards,
  employeeLoans, bankAccounts, accounts,
} from '@runq/db';
import type { Db } from '@runq/db';
import type {
  RecordSalaryPaymentInput, RecordReimbursementPaymentInput, PayRewardInput,
  DisburseLoanInput,
} from '@runq/validators';
import { GLService } from '../../gl/gl.service';
import { NotFoundError, ConflictError } from '../../../utils/errors';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const r2 = (n: number): number => Math.round(n * 100) / 100;
const monthLabel = (year: number, month: number): string => `${MONTHS[month - 1]} ${year}`;

/**
 * Payroll subledger settlement: records that net pay (or, later, an expense
 * reimbursement) was disbursed to an employee, and posts the GL entry that
 * clears the source-specific payable (2110 Salary Payable for payroll,
 * 2111 Employee Reimbursements Payable for claims) against the bank.
 *
 * Phase 1 covers net-pay disbursement against a payroll run. Reimbursement
 * (source='expense_claim') uses the same table and ships in Phase 3.
 */
export class EmployeePaymentService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  async list() {
    return this.db
      .select()
      .from(employeePayments)
      .where(eq(employeePayments.tenantId, this.tenantId))
      .orderBy(desc(employeePayments.paymentDate), desc(employeePayments.createdAt));
  }

  async getById(id: string) {
    const [row] = await this.db
      .select()
      .from(employeePayments)
      .where(and(eq(employeePayments.id, id), eq(employeePayments.tenantId, this.tenantId)))
      .limit(1);
    if (!row) throw new NotFoundError('Employee payment');
    return row;
  }

  async listForRun(payrollRunId: string) {
    return this.db
      .select()
      .from(employeePayments)
      .where(and(
        eq(employeePayments.tenantId, this.tenantId),
        eq(employeePayments.payrollRunId, payrollRunId),
      ))
      .orderBy(desc(employeePayments.createdAt));
  }

  /**
   * Record a salary disbursement for an approved payroll run. Atomic: creates
   * the payment row, posts the settlement JE (Dr 2110 Salary Payable / Cr
   * bank-GL), links the JE, and marks the payment 'paid' — all in one
   * transaction.
   */
  async recordSalaryPayment(input: RecordSalaryPaymentInput, userId: string) {
    const [run] = await this.db
      .select()
      .from(payrollRuns)
      .where(and(
        eq(payrollRuns.id, input.payrollRunId),
        eq(payrollRuns.tenantId, this.tenantId),
      ))
      .limit(1);
    if (!run) throw new NotFoundError('Payroll run');
    if (run.status !== 'approved' && run.status !== 'closed') {
      throw new ConflictError('Payroll run must be approved before recording payment');
    }

    // Refuse if this run is already marked paid — a second disbursement would
    // double-debit Salary Payable. The user can reverse and re-record.
    const [existingPaid] = await this.db
      .select({ id: employeePayments.id })
      .from(employeePayments)
      .where(and(
        eq(employeePayments.tenantId, this.tenantId),
        eq(employeePayments.payrollRunId, input.payrollRunId),
        eq(employeePayments.status, 'paid'),
      ))
      .limit(1);
    if (existingPaid) {
      throw new ConflictError('This run is already marked paid');
    }

    // Total to settle = sum of net pay on the run's payslips. This matches
    // the credit posted to 2110 when the run was approved.
    const [totalRow] = await this.db
      .select({ total: sql<string>`COALESCE(SUM(${payslips.netPay}), '0')` })
      .from(payslips)
      .where(eq(payslips.payrollRunId, input.payrollRunId));
    const amount = r2(Number(totalRow?.total ?? 0));
    if (amount <= 0) {
      throw new ConflictError('Run has no net pay to disburse');
    }

    const bankGlCode = await this.bankGlAccountCode(input.bankAccountId);

    return this.db.transaction(async (tx) => {
      const [payment] = await tx
        .insert(employeePayments)
        .values({
          tenantId: this.tenantId,
          sourceType: 'payroll_run',
          payrollRunId: input.payrollRunId,
          paymentDate: input.paymentDate,
          amount: String(amount),
          bankAccountId: input.bankAccountId,
          paymentMethod: input.paymentMethod ?? 'bank_transfer',
          reference: input.reference ?? null,
          status: 'paid',
          notes: input.notes ?? null,
          createdBy: userId,
        })
        .returning();

      // Nested-via-savepoint: GLService opens its own transaction internally;
      // Drizzle pg handles it as a SAVEPOINT under the outer tx.
      const gl = new GLService(tx as unknown as Db, this.tenantId);
      const je = await gl.createJournalEntry({
        date: input.paymentDate,
        description: `Salary payment — ${monthLabel(run.year, run.month)}`,
        sourceType: 'employee_payment',
        sourceId: payment.id,
        lines: [
          { accountCode: '2110', debit: amount, description: 'Salary Payable cleared' },
          { accountCode: bankGlCode, credit: amount, description: 'Net pay disbursement' },
        ],
        createdBy: userId,
      });

      const [updated] = await tx
        .update(employeePayments)
        .set({ journalEntryId: je.id, updatedAt: new Date() })
        .where(eq(employeePayments.id, payment.id))
        .returning();
      return updated;
    });
  }

  /**
   * Record a reimbursement payment for a posted expense claim. Atomic: creates
   * the payment row (sourceType='expense_claim'), posts the settlement JE
   * (Dr 2111 Employee Reimbursements Payable / Cr bank-GL), links the JE,
   * marks the claim 'reimbursed'.
   */
  async recordReimbursementPayment(input: RecordReimbursementPaymentInput, userId: string) {
    const [claim] = await this.db
      .select()
      .from(expenseClaims)
      .where(and(
        eq(expenseClaims.id, input.expenseClaimId),
        eq(expenseClaims.tenantId, this.tenantId),
      ))
      .limit(1);
    if (!claim) throw new NotFoundError('Expense claim');
    if (!claim.journalEntryId) {
      throw new ConflictError('Claim must be posted to GL before recording reimbursement');
    }
    if (claim.status === 'reimbursed') {
      throw new ConflictError('Claim is already marked reimbursed');
    }

    const amount = Math.round(Number(claim.totalAmount) * 100) / 100;
    if (amount <= 0) {
      throw new ConflictError('Claim has zero amount — nothing to reimburse');
    }
    const bankGlCode = await this.bankGlAccountCode(input.bankAccountId);

    return this.db.transaction(async (tx) => {
      const [payment] = await tx
        .insert(employeePayments)
        .values({
          tenantId: this.tenantId,
          sourceType: 'expense_claim',
          expenseClaimId: claim.id,
          employeeId: claim.employeeId,
          paymentDate: input.paymentDate,
          amount: String(amount),
          bankAccountId: input.bankAccountId,
          paymentMethod: input.paymentMethod ?? 'bank_transfer',
          reference: input.reference ?? null,
          status: 'paid',
          notes: input.notes ?? null,
          createdBy: userId,
        })
        .returning();

      const gl = new GLService(tx as unknown as Db, this.tenantId);
      const je = await gl.createJournalEntry({
        date: input.paymentDate,
        description: `Reimbursement — ${claim.claimNumber}`,
        sourceType: 'employee_payment',
        sourceId: payment.id,
        lines: [
          { accountCode: '2111', debit: amount, description: 'Employee reimbursement cleared' },
          { accountCode: bankGlCode, credit: amount, description: `Reimbursement to ${claim.claimNumber}` },
        ],
        createdBy: userId,
      });

      const [updated] = await tx
        .update(employeePayments)
        .set({ journalEntryId: je.id, updatedAt: new Date() })
        .where(eq(employeePayments.id, payment.id))
        .returning();

      await tx
        .update(expenseClaims)
        .set({
          status: 'reimbursed',
          reimbursedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(expenseClaims.id, claim.id));

      return updated;
    });
  }

  /**
   * Disburse an approved + posted monetary reward. Atomic: creates the
   * payment row (sourceType='employee_reward'), posts the settlement JE
   * (Dr 2114 Employee Rewards Payable / Cr bank-GL), links the JE, and
   * marks the reward 'paid'.
   */
  async recordRewardPayment(rewardId: string, input: PayRewardInput, userId: string) {
    const [reward] = await this.db
      .select()
      .from(employeeRewards)
      .where(and(
        eq(employeeRewards.id, rewardId),
        eq(employeeRewards.tenantId, this.tenantId),
      ))
      .limit(1);
    if (!reward) throw new NotFoundError('Reward');
    if (reward.status !== 'posted') {
      throw new ConflictError('Reward must be posted to GL before recording payout');
    }
    const amount = r2(Number(reward.amount));
    if (amount <= 0) throw new ConflictError('Reward has zero amount — nothing to pay');
    const bankGlCode = await this.bankGlAccountCode(input.bankAccountId);

    return this.db.transaction(async (tx) => {
      const [payment] = await tx
        .insert(employeePayments)
        .values({
          tenantId: this.tenantId,
          sourceType: 'employee_reward',
          employeeRewardId: reward.id,
          employeeId: reward.employeeId,
          paymentDate: input.paymentDate,
          amount: String(amount),
          bankAccountId: input.bankAccountId,
          paymentMethod: input.paymentMethod ?? 'bank_transfer',
          reference: input.reference ?? null,
          status: 'paid',
          notes: input.notes ?? null,
          createdBy: userId,
        })
        .returning();

      const gl = new GLService(tx as unknown as Db, this.tenantId);
      const je = await gl.createJournalEntry({
        date: input.paymentDate,
        description: `Reward payout — ${reward.rewardNumber}`,
        sourceType: 'employee_payment',
        sourceId: payment.id,
        lines: [
          { accountCode: '2114', debit: amount, description: 'Employee reward cleared' },
          { accountCode: bankGlCode, credit: amount, description: `Reward payout ${reward.rewardNumber}` },
        ],
        createdBy: userId,
      });

      const [updated] = await tx
        .update(employeePayments)
        .set({ journalEntryId: je.id, updatedAt: new Date() })
        .where(eq(employeePayments.id, payment.id))
        .returning();

      await tx
        .update(employeeRewards)
        .set({ status: 'paid', updatedAt: new Date() })
        .where(eq(employeeRewards.id, reward.id));

      return updated;
    });
  }

  /**
   * Pay out an approved advance / loan. Unlike the other settlements here this
   * one does not clear a payable — it raises an asset: the company is now owed
   * the money, and payroll works that receivable back down via 1122 as it
   * recovers each instalment.
   */
  async recordLoanDisbursement(loanId: string, input: DisburseLoanInput, userId: string) {
    const [loan] = await this.db
      .select()
      .from(employeeLoans)
      .where(and(eq(employeeLoans.id, loanId), eq(employeeLoans.tenantId, this.tenantId)))
      .limit(1);
    if (!loan) throw new NotFoundError('Loan');
    if (loan.status !== 'active') {
      throw new ConflictError('Loan must be approved before it can be disbursed');
    }

    const [existing] = await this.db
      .select({ id: employeePayments.id })
      .from(employeePayments)
      .where(and(
        eq(employeePayments.tenantId, this.tenantId),
        eq(employeePayments.employeeLoanId, loanId),
        eq(employeePayments.status, 'paid'),
      ))
      .limit(1);
    if (existing) throw new ConflictError('This loan is already disbursed');

    const amount = r2(Number(loan.principal));
    const creditCode = input.bankAccountId
      ? await this.bankGlAccountCode(input.bankAccountId)
      : '1102'; // cash-in-hand payout, no bank account named
    return this.postLoanDisbursement(loan, amount, creditCode, input, userId);
  }

  private async postLoanDisbursement(
    loan: typeof employeeLoans.$inferSelect,
    amount: number,
    creditCode: string,
    input: DisburseLoanInput,
    userId: string,
  ) {
    return this.db.transaction(async (tx) => {
      const [payment] = await tx
        .insert(employeePayments)
        .values({
          tenantId: this.tenantId,
          sourceType: 'employee_loan',
          employeeLoanId: loan.id,
          employeeId: loan.employeeId,
          paymentDate: input.paymentDate,
          amount: String(amount),
          bankAccountId: input.bankAccountId ?? null,
          paymentMethod: input.paymentMethod ?? 'bank_transfer',
          reference: input.reference ?? null,
          status: 'paid',
          notes: input.notes ?? null,
          createdBy: userId,
        })
        .returning();

      const gl = new GLService(tx as unknown as Db, this.tenantId);
      const je = await gl.createJournalEntry({
        date: input.paymentDate,
        description: `Advance / loan disbursement — ${loan.kind}`,
        sourceType: 'employee_payment',
        sourceId: payment.id,
        lines: [
          { accountCode: '1122', debit: amount, description: 'Employee advance receivable' },
          { accountCode: creditCode, credit: amount, description: 'Advance / loan paid out' },
        ],
        createdBy: userId,
      });

      const [updated] = await tx
        .update(employeePayments)
        .set({ journalEntryId: je.id, updatedAt: new Date() })
        .where(eq(employeePayments.id, payment.id))
        .returning();
      return updated;
    });
  }

  /** Resolve the GL account code for a bank account; falls back to 1101 cash. */
  private async bankGlAccountCode(bankAccountId: string): Promise<string> {
    const [row] = await this.db
      .select({ glAccountId: bankAccounts.glAccountId })
      .from(bankAccounts)
      .where(and(
        eq(bankAccounts.id, bankAccountId),
        eq(bankAccounts.tenantId, this.tenantId),
      ))
      .limit(1);
    if (!row) throw new NotFoundError('Bank account');
    if (!row.glAccountId) return '1101';
    const [acct] = await this.db
      .select({ code: accounts.code })
      .from(accounts)
      .where(eq(accounts.id, row.glAccountId))
      .limit(1);
    return acct?.code ?? '1101';
  }
}
