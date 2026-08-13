import { eq, and, lte, lt, asc, sql } from 'drizzle-orm';
import {
  employeeLoans, employeeLoanInstalments, employeeDeductions,
  employeeDeductionRecoveries,
} from '@runq/db';
import type { Db } from '@runq/db';

type Tx = Db;
type LineItem = { code: string; name: string; amount: number };

function r2(n: number): number { return Math.round(n * 100) / 100; }

/** Ordinal position of a month, so "due on or before this run" is one compare. */
export function period(year: number, month: number): number { return year * 12 + month; }

const isRecoveryCode = (code: string) =>
  code.startsWith('LOAN_') || code.startsWith('DED_');

/**
 * Reconcile a hand-edited deduction list against the recovery lines payroll
 * put there.
 *
 * Those lines are backed by real ledger writes — the instalment is marked paid
 * and the outstanding is already down. Letting HR delete or reprice one on the
 * payslip would leave the employee's balance reduced by money the payslip no
 * longer says was taken. So edits to non-recovery lines are honoured and the
 * recovery lines are restored verbatim. To stop recovering, cancel the
 * deduction or close the loan — don't edit the symptom.
 */
export function mergeRecoveryLines(prior: LineItem[], edited: LineItem[]): LineItem[] {
  const recoveries = prior.filter((d) => isRecoveryCode(d.code));
  const editable = edited.filter((d) => !isRecoveryCode(d.code));
  return [...editable, ...recoveries];
}

/**
 * Split a budget across due instalments, oldest first.
 *
 * Pure so the arithmetic that decides how much of an employee's pay is taken
 * can be tested without a database. Returns what to pay against each
 * instalment; an instalment the budget can only part-cover gets a partial
 * payment and stays open for next month.
 */
export function planInstalmentPayments(
  due: Array<{ id: string; amount: number; paidAmount: number }>,
  budget: number,
): Array<{ id: string; pay: number }> {
  let available = r2(budget);
  const plan: Array<{ id: string; pay: number }> = [];
  for (const inst of due) {
    if (available <= 0) break;
    const owing = r2(inst.amount - inst.paidAmount);
    const pay = r2(Math.min(owing, available));
    if (pay <= 0) continue;
    plan.push({ id: inst.id, pay });
    available = r2(available - pay);
  }
  return plan;
}

/**
 * What a single ad-hoc deduction takes this run: its own per-run ceiling, what
 * it still owes, and what the payslip can actually bear — whichever binds
 * first. Never negative, so a fully recovered debt is simply skipped.
 */
export function deductionTake(
  instalment: number, outstanding: number, available: number,
): number {
  return Math.max(0, r2(Math.min(instalment, outstanding, available)));
}

const LOAN_LABEL: Record<string, string> = {
  advance: 'Salary Advance',
  personal: 'Personal Loan',
  festival: 'Festival Advance',
  education: 'Education Loan',
  other: 'Loan',
};

const DEDUCTION_LABEL: Record<string, string> = {
  goods_purchase: 'Goods Purchase',
  canteen: 'Canteen',
  damage: 'Damage Recovery',
  uniform: 'Uniform',
  fine: 'Fine',
  other: 'Deduction',
};

/**
 * Undo everything a run previously recovered.
 *
 * `process()` rebuilds a draft run from scratch — it wipes and re-inserts every
 * payslip. Recovery writes live outside the payslip (on the loan and deduction
 * rows), so they survive that wipe; without this reversal a second process()
 * would recover the same EMI twice and close loans early. Called once at the
 * top of the run transaction, before anything is recalculated.
 */
export async function reverseRunRecoveries(tx: Tx, tenantId: string, runId: string): Promise<void> {
  const paid = await tx
    .select()
    .from(employeeLoanInstalments)
    .where(and(
      eq(employeeLoanInstalments.tenantId, tenantId),
      eq(employeeLoanInstalments.paidPayrollRunId, runId),
    ));

  const byLoan = new Map<string, number>();
  for (const inst of paid) {
    byLoan.set(inst.loanId, r2((byLoan.get(inst.loanId) ?? 0) + Number(inst.paidAmount)));
  }
  for (const [loanId, amount] of byLoan) {
    // A loan closed by this run must reopen — it is owed again.
    await tx
      .update(employeeLoans)
      .set({
        outstanding: sql`${employeeLoans.outstanding} + ${String(amount)}`,
        status: 'active',
        closedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(employeeLoans.id, loanId));
  }
  if (paid.length > 0) {
    await tx
      .update(employeeLoanInstalments)
      .set({ paidAmount: '0', paidPayrollRunId: null, paidAt: null })
      .where(and(
        eq(employeeLoanInstalments.tenantId, tenantId),
        eq(employeeLoanInstalments.paidPayrollRunId, runId),
      ));
  }

  await reverseDeductionRecoveries(tx, tenantId, runId);
}

async function reverseDeductionRecoveries(tx: Tx, tenantId: string, runId: string): Promise<void> {
  const recs = await tx
    .select()
    .from(employeeDeductionRecoveries)
    .where(and(
      eq(employeeDeductionRecoveries.tenantId, tenantId),
      eq(employeeDeductionRecoveries.payrollRunId, runId),
    ));
  if (recs.length === 0) return;

  const byDeduction = new Map<string, number>();
  for (const r of recs) {
    byDeduction.set(r.deductionId, r2((byDeduction.get(r.deductionId) ?? 0) + Number(r.amount)));
  }
  for (const [deductionId, amount] of byDeduction) {
    await tx
      .update(employeeDeductions)
      .set({
        outstanding: sql`${employeeDeductions.outstanding} + ${String(amount)}`,
        status: 'active',
        updatedAt: new Date(),
      })
      .where(eq(employeeDeductions.id, deductionId));
  }
  await tx
    .delete(employeeDeductionRecoveries)
    .where(and(
      eq(employeeDeductionRecoveries.tenantId, tenantId),
      eq(employeeDeductionRecoveries.payrollRunId, runId),
    ));
}

type ApplyInput = {
  tenantId: string;
  runId: string;
  employeeId: string;
  year: number;
  month: number;
  /** Net pay left after earnings and statutory deductions. Never goes below 0. */
  available: number;
};

/**
 * Recover what this month's pay can absorb, and no more.
 *
 * Loans go first (they carry an agreed schedule), then ad-hoc deductions in
 * the order they were raised. Each recovery is capped at the remaining net, so
 * a payslip can reach zero but never negative — an LOP-heavy month simply
 * recovers less and the shortfall stays outstanding for the next run.
 */
export async function applyEmployeeRecoveries(tx: Tx, input: ApplyInput): Promise<LineItem[]> {
  let available = Math.max(0, r2(input.available));
  if (available <= 0) return [];

  const lines: LineItem[] = [];
  const loanLines = await recoverLoans(tx, input, available);
  for (const l of loanLines.lines) lines.push(l);
  available = r2(available - loanLines.taken);

  if (available > 0) {
    const dedLines = await recoverDeductions(tx, input, available);
    for (const l of dedLines.lines) lines.push(l);
  }
  return lines;
}

async function recoverLoans(
  tx: Tx, input: ApplyInput, budget: number,
): Promise<{ lines: LineItem[]; taken: number }> {
  const loans = await tx
    .select()
    .from(employeeLoans)
    .where(and(
      eq(employeeLoans.tenantId, input.tenantId),
      eq(employeeLoans.employeeId, input.employeeId),
      eq(employeeLoans.status, 'active'),
    ))
    .orderBy(asc(employeeLoans.disbursedOn));

  const lines: LineItem[] = [];
  let available = budget;

  for (const loan of loans) {
    if (available <= 0) break;
    const cap = Math.min(available, r2(Number(loan.outstanding)));
    if (cap <= 0) continue;

    const taken = await payInstalments(tx, input, loan.id, cap);
    if (taken <= 0) continue;

    available = r2(available - taken);
    const remaining = r2(Number(loan.outstanding) - taken);
    await tx
      .update(employeeLoans)
      .set({
        outstanding: String(remaining),
        ...(remaining <= 0
          ? { status: 'closed' as const, closedAt: new Date() }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(employeeLoans.id, loan.id));

    lines.push({
      code: `LOAN_${loan.id.slice(0, 8)}`,
      name: loanLineName(loan.kind, loan.totalInstalments, taken, remaining),
      amount: taken,
    });
  }
  return { lines, taken: r2(budget - available) };
}

function loanLineName(
  kind: string, totalInstalments: number, taken: number, remaining: number,
): string {
  const label = LOAN_LABEL[kind] ?? 'Loan';
  if (totalInstalments <= 1) return label;
  return remaining > 0 ? `${label} EMI` : `${label} EMI (final)`;
}

/**
 * Settle a loan's due instalments oldest-first out of `budget`.
 *
 * Anything due on or before this run is fair game, not just the current
 * month's — a skipped month leaves arrears, and those should clear as soon as
 * a payslip can carry them.
 */
async function payInstalments(
  tx: Tx, input: ApplyInput, loanId: string, budget: number,
): Promise<number> {
  const due = await tx
    .select()
    .from(employeeLoanInstalments)
    .where(and(
      eq(employeeLoanInstalments.loanId, loanId),
      lt(employeeLoanInstalments.paidAmount, employeeLoanInstalments.amount),
      lte(
        sql`${employeeLoanInstalments.dueYear} * 12 + ${employeeLoanInstalments.dueMonth}`,
        period(input.year, input.month),
      ),
    ))
    .orderBy(asc(employeeLoanInstalments.sequence));

  const paidSoFar = new Map(due.map((i) => [i.id, Number(i.paidAmount)]));
  const plan = planInstalmentPayments(
    due.map((i) => ({ id: i.id, amount: Number(i.amount), paidAmount: Number(i.paidAmount) })),
    budget,
  );

  let taken = 0;
  for (const step of plan) {
    await tx
      .update(employeeLoanInstalments)
      .set({
        paidAmount: String(r2((paidSoFar.get(step.id) ?? 0) + step.pay)),
        paidPayrollRunId: input.runId,
        paidAt: new Date(),
      })
      .where(eq(employeeLoanInstalments.id, step.id));
    taken = r2(taken + step.pay);
  }
  return taken;
}

async function recoverDeductions(
  tx: Tx, input: ApplyInput, budget: number,
): Promise<{ lines: LineItem[]; taken: number }> {
  const rows = await tx
    .select()
    .from(employeeDeductions)
    .where(and(
      eq(employeeDeductions.tenantId, input.tenantId),
      eq(employeeDeductions.employeeId, input.employeeId),
      eq(employeeDeductions.status, 'active'),
      lte(
        sql`${employeeDeductions.startYear} * 12 + ${employeeDeductions.startMonth}`,
        period(input.year, input.month),
      ),
    ))
    .orderBy(asc(employeeDeductions.createdAt));

  const lines: LineItem[] = [];
  let available = budget;

  for (const ded of rows) {
    if (available <= 0) break;
    const take = deductionTake(Number(ded.instalment), Number(ded.outstanding), available);
    if (take <= 0) continue;

    const remaining = r2(Number(ded.outstanding) - take);
    await tx
      .update(employeeDeductions)
      .set({
        outstanding: String(remaining),
        ...(remaining <= 0 ? { status: 'recovered' as const } : {}),
        updatedAt: new Date(),
      })
      .where(eq(employeeDeductions.id, ded.id));

    await tx.insert(employeeDeductionRecoveries).values({
      tenantId: input.tenantId,
      deductionId: ded.id,
      payrollRunId: input.runId,
      amount: String(take),
    });

    available = r2(available - take);
    lines.push({
      code: `DED_${ded.id.slice(0, 8)}`,
      name: deductionLineName(ded.category, ded.description),
      amount: take,
    });
  }
  return { lines, taken: r2(budget - available) };
}

function deductionLineName(category: string, description: string | null): string {
  const label = DEDUCTION_LABEL[category] ?? 'Deduction';
  return description ? `${label} — ${description}` : label;
}

/**
 * What a run recovered, split by where the credit belongs in the GL: loan
 * recovery clears the 1122 receivable raised at disbursement, while an ad-hoc
 * deduction was never booked as an asset and credits 4208 instead.
 */
export async function runRecoveryTotals(
  db: Db, tenantId: string, runId: string,
): Promise<{ loans: number; deductions: number }> {
  const [loanRow] = await db
    .select({ total: sql<string>`coalesce(sum(${employeeLoanInstalments.paidAmount}), 0)` })
    .from(employeeLoanInstalments)
    .where(and(
      eq(employeeLoanInstalments.tenantId, tenantId),
      eq(employeeLoanInstalments.paidPayrollRunId, runId),
    ));
  const [dedRow] = await db
    .select({ total: sql<string>`coalesce(sum(${employeeDeductionRecoveries.amount}), 0)` })
    .from(employeeDeductionRecoveries)
    .where(and(
      eq(employeeDeductionRecoveries.tenantId, tenantId),
      eq(employeeDeductionRecoveries.payrollRunId, runId),
    ));

  return {
    loans: r2(Number(loanRow?.total ?? 0)),
    deductions: r2(Number(dedRow?.total ?? 0)),
  };
}
