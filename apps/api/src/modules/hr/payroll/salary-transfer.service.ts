import { eq, and, inArray, asc } from 'drizzle-orm';
import { employeePayments, payrollRuns, payslips, employees } from '@runq/db';
import type { Db } from '@runq/db';
import type { MarkSalaryTransfersInput } from '@runq/validators';
import { GLService } from '../../gl/gl.service';
import { NotFoundError, ConflictError } from '../../../utils/errors';
import { bankGlAccountCode } from './employee-payment.service';

/** A salary transfer as it appears on the bank statement. */
export interface BankTransfer {
  amount: number;
  date: string;
  bankAccountId: string;
  reference: string | null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const GL_SOURCE = 'employee_payment';

/**
 * Per-employee salary transfers for a payroll run. Approving a run opens one
 * `pending` payment per payslip with net pay; HR marks each one transferred
 * with its UTR as the money actually goes out. Each transfer posts its own
 * Dr 2110 Salary Payable / Cr bank entry, so the books match the bank
 * statement line for line instead of one lump sum.
 *
 * Tracking starts at approval because re-processing a run rebuilds its
 * payslips; once approved, the amounts are fixed.
 */
export class SalaryTransferService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  /** Open a pending transfer for every payslip that doesn't have one yet. */
  async ensurePending(runId: string) {
    const slips = await this.db
      .select({ employeeId: payslips.employeeId, netPay: payslips.netPay })
      .from(payslips)
      .where(and(eq(payslips.tenantId, this.tenantId), eq(payslips.payrollRunId, runId)));
    const existing = await this.db
      .select({ employeeId: employeePayments.employeeId })
      .from(employeePayments)
      .where(and(
        eq(employeePayments.tenantId, this.tenantId),
        eq(employeePayments.payrollRunId, runId),
      ));
    const have = new Set(existing.map((e) => e.employeeId));
    const today = new Date().toISOString().slice(0, 10);
    const rows = slips
      .filter((s) => Number(s.netPay) > 0 && !have.has(s.employeeId))
      .map((s) => ({
        tenantId: this.tenantId,
        sourceType: 'payroll_run' as const,
        payrollRunId: runId,
        employeeId: s.employeeId,
        // Placeholder until the transfer is made; replaced on mark.
        paymentDate: today,
        amount: s.netPay,
        status: 'pending' as const,
      }));
    if (rows.length) await this.db.insert(employeePayments).values(rows);
  }

  /** The run's transfers with who they are for, pending first. */
  async listForRun(runId: string) {
    const run = await this.loadRun(runId);
    if (run.status === 'approved' || run.status === 'closed') await this.ensurePending(runId);
    return this.db
      .select({
        id: employeePayments.id,
        employeeId: employeePayments.employeeId,
        employeeName: employees.firstName,
        employeeLastName: employees.lastName,
        employeeCode: employees.employeeCode,
        amount: employeePayments.amount,
        status: employeePayments.status,
        paymentDate: employeePayments.paymentDate,
        paymentMethod: employeePayments.paymentMethod,
        bankAccountId: employeePayments.bankAccountId,
        reference: employeePayments.reference,
      })
      .from(employeePayments)
      .leftJoin(employees, eq(employees.id, employeePayments.employeeId))
      .where(and(
        eq(employeePayments.tenantId, this.tenantId),
        eq(employeePayments.payrollRunId, runId),
      ))
      .orderBy(asc(employeePayments.status), asc(employees.firstName));
  }

  /** Mark pending transfers done, each with its own UTR and GL entry. */
  async markTransferred(runId: string, input: MarkSalaryTransfersInput, userId: string) {
    const run = await this.loadRun(runId);
    if (run.status !== 'approved' && run.status !== 'closed') {
      throw new ConflictError('Approve the payroll run before recording transfers');
    }
    const ids = input.items.map((i) => i.paymentId);
    const pending = await this.db
      .select({ id: employeePayments.id, amount: employeePayments.amount, employeeId: employeePayments.employeeId })
      .from(employeePayments)
      .where(and(
        eq(employeePayments.tenantId, this.tenantId),
        eq(employeePayments.payrollRunId, runId),
        eq(employeePayments.status, 'pending'),
        inArray(employeePayments.id, ids),
      ));
    if (pending.length !== ids.length) {
      throw new ConflictError('Some of these transfers are already marked transferred — refresh and try again');
    }
    const bankGl = await bankGlAccountCode(this.db, this.tenantId, input.bankAccountId);
    const refs = new Map(input.items.map((i) => [i.paymentId, i.reference || null]));
    const label = `${MONTHS[run.month - 1]} ${run.year}`;

    return this.db.transaction(async (tx) => {
      const done = [];
      for (const p of pending) {
        done.push(await this.post(tx as unknown as Db, p, {
          ...input, bankGl, label, userId, reference: refs.get(p.id) ?? null,
        }));
      }
      return done;
    });
  }

  /** One transfer: its own Dr 2110 / Cr bank entry, then the row goes paid. */
  private async post(
    tx: Db,
    p: { id: string; amount: string },
    o: Omit<MarkSalaryTransfersInput, 'items'> & {
      bankGl: string; label: string; userId: string | null; reference: string | null;
    },
  ) {
    const amount = Number(p.amount);
    const je = await new GLService(tx, this.tenantId).createJournalEntry({
      date: o.paymentDate,
      description: `Salary transfer — ${o.label}`,
      sourceType: GL_SOURCE,
      sourceId: p.id,
      lines: [
        { accountCode: '2110', debit: amount, description: 'Salary Payable cleared' },
        { accountCode: o.bankGl, credit: amount, description: 'Net pay transfer' },
      ],
      createdBy: o.userId ?? undefined,
    });
    const [row] = await tx.update(employeePayments).set({
      status: 'paid',
      amount: p.amount,
      paymentDate: o.paymentDate,
      bankAccountId: o.bankAccountId,
      paymentMethod: o.paymentMethod,
      reference: o.reference,
      journalEntryId: je.id,
      createdBy: o.userId,
      updatedAt: new Date(),
    }).where(eq(employeePayments.id, p.id)).returning();
    return row!;
  }

  /**
   * Record a transfer the way the bank statement shows it. A pending transfer
   * is marked paid; one already marked at a different amount (net pay
   * entered, less actually sent) is re-posted at the bank figure. A shortfall
   * stays open as a new pending transfer, so Salary Payable still shows it.
   * Runs on the caller's db/tx; returns the transfer's JE id.
   */
  async settleFromBank(paymentId: string, bank: BankTransfer): Promise<string> {
    const [p] = await this.db.select().from(employeePayments).where(and(
      eq(employeePayments.tenantId, this.tenantId),
      eq(employeePayments.id, paymentId),
      eq(employeePayments.sourceType, 'payroll_run'),
    ));
    if (!p?.payrollRunId) throw new NotFoundError('Salary transfer');
    const run = await this.loadRun(p.payrollRunId);
    const shortfall = Math.round((Number(p.amount) - bank.amount) * 100) / 100;
    if (shortfall <= -1) throw new ConflictError('The bank transfer is more than the salary due');
    if (p.status === 'paid') {
      await this.db.update(employeePayments).set({ journalEntryId: null }).where(eq(employeePayments.id, p.id));
      await new GLService(this.db, this.tenantId).deletePostingsFor(GL_SOURCE, p.id);
    }
    if (shortfall >= 1) {
      await this.db.insert(employeePayments).values({
        tenantId: this.tenantId, sourceType: 'payroll_run', payrollRunId: p.payrollRunId,
        employeeId: p.employeeId, paymentDate: bank.date, amount: shortfall.toFixed(2), status: 'pending',
      });
    }
    const row = await this.post(this.db, { id: p.id, amount: bank.amount.toFixed(2) }, {
      paymentDate: bank.date, bankAccountId: bank.bankAccountId, paymentMethod: 'bank_transfer',
      bankGl: await bankGlAccountCode(this.db, this.tenantId, bank.bankAccountId),
      label: `${MONTHS[run.month - 1]} ${run.year}`, userId: p.createdBy, reference: bank.reference,
    });
    return row.journalEntryId!;
  }

  /** Undo a transfer recorded by mistake: drop its GL entry, back to pending. */
  async undo(paymentId: string) {
    const [p] = await this.db
      .select()
      .from(employeePayments)
      .where(and(eq(employeePayments.tenantId, this.tenantId), eq(employeePayments.id, paymentId)));
    if (!p || p.sourceType !== 'payroll_run') throw new NotFoundError('Salary transfer');
    if (p.status !== 'paid') throw new ConflictError('This transfer is not marked transferred');
    return this.db.transaction(async (tx) => {
      // Unlink first — the payment row holds an FK to the entry being dropped.
      const [row] = await tx.update(employeePayments).set({
        status: 'pending', reference: null, bankAccountId: null, journalEntryId: null, updatedAt: new Date(),
      }).where(eq(employeePayments.id, p.id)).returning();
      await new GLService(tx as unknown as Db, this.tenantId).deletePostingsFor(GL_SOURCE, p.id);
      return row!;
    });
  }

  private async loadRun(runId: string) {
    const [run] = await this.db
      .select({ status: payrollRuns.status, month: payrollRuns.month, year: payrollRuns.year })
      .from(payrollRuns)
      .where(and(eq(payrollRuns.tenantId, this.tenantId), eq(payrollRuns.id, runId)));
    if (!run) throw new NotFoundError('Payroll run');
    return run;
  }
}
