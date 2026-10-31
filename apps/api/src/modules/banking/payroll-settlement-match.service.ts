import { sql, eq, and } from 'drizzle-orm';
import { bankTransactions, reconciliationMatches, accounts, employeePayments } from '@runq/db';
import type { Db } from '@runq/db';
import { SalaryTransferService } from '../hr/payroll/salary-transfer.service';

const MATCH_DATE_WINDOW_DAYS = 5;
const AMOUNT_TOLERANCE = 1;
const SALARY_PAYABLE_CODE = '2110';
/** Shorter first names ("Raj") turn up inside unrelated narration words. */
const MIN_NAME_LENGTH = 4;

export interface SalaryTransfer {
  id: string;
  status: 'pending' | 'paid';
  amount: number;
  date: string;
  /** Last day of the month the run pays for; salary can't go out before it. */
  payableFrom: string;
  reference: string | null;
  bankAccountId: string | null;
  names: string[];
}

export interface SalaryDebit {
  id: string;
  amount: string;
  transactionDate: string;
  narration: string | null;
}

export interface SalaryMatch {
  transfer: SalaryTransfer;
  /** Matched on the UTR HR entered — the amount may legitimately differ. */
  byUtr: boolean;
}

const alpha = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, '');

/**
 * Payroll salary is expensed by the payroll run (Dr Salary / Cr Salary
 * Payable). Each transfer then settles Salary Payable against the bank. The
 * NEFT in the bank statement is that same money — categorizing it as a salary
 * expense books the month's payroll a second time. This links such a debit to
 * its transfer instead: by the UTR HR recorded, else by employee name and
 * amount. A pending transfer is marked paid from the bank line.
 */
export class PayrollSettlementMatchService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  /** Transfers of approved runs that no bank line points at yet. */
  async loadOpen(): Promise<SalaryTransfer[]> {
    const res = await this.db.execute(sql`
      SELECT ep.id, ep.status, ep.amount, ep.payment_date::text AS date, ep.reference, ep.bank_account_id,
             (make_date(r.year, r.month, 1) + interval '1 month - 1 day')::date::text AS payable_from, e.first_name, e.last_name
      FROM employee_payments ep
      JOIN payroll_runs r ON r.id = ep.payroll_run_id AND r.status IN ('approved', 'closed')
      JOIN employees e ON e.id = ep.employee_id
      WHERE ep.tenant_id = ${this.tenantId} AND ep.source_type = 'payroll_run'
        AND (ep.status = 'pending' OR (ep.status = 'paid' AND ep.payment_method = 'bank_transfer'
             AND NOT EXISTS (SELECT 1 FROM bank_transactions bt
                             WHERE bt.tenant_id = ${this.tenantId} AND bt.journal_entry_id = ep.journal_entry_id)))
    `);
    const rows = (res as { rows?: Record<string, string | null>[] }).rows ?? [];
    return rows.map((r) => ({
      id: r.id!,
      status: r.status as SalaryTransfer['status'],
      amount: parseFloat(r.amount!),
      date: r.date!,
      payableFrom: r.payable_from!,
      reference: r.reference?.trim() || null,
      bankAccountId: r.bank_account_id,
      names: [r.first_name, r.last_name].map((n) => alpha(n ?? '')).filter((n) => n.length >= MIN_NAME_LENGTH),
    }));
  }

  /**
   * UTR match first (amount may differ — HR enters net pay, the bank shows
   * what was sent). Otherwise the employee's name must be in the narration
   * and the amount within ±₹1: a paid transfer within ±5 days on the same
   * bank, or a pending one once the run's month has ended. Ambiguous → none.
   */
  pick(txn: SalaryDebit, bankAccountId: string, pool: SalaryTransfer[], used: Set<string>): SalaryMatch | null {
    const narration = (txn.narration ?? '').toUpperCase();
    const open = pool.filter((t) => !used.has(t.id) && (!t.bankAccountId || t.bankAccountId === bankAccountId));
    const utr = open.find((t) => t.status === 'paid' && t.reference && narration.includes(t.reference.toUpperCase()));
    if (utr) return { transfer: utr, byUtr: true };

    const amount = parseFloat(txn.amount);
    const txnDay = Date.parse(txn.transactionDate);
    const named = alpha(narration);
    const candidates = open.filter((t) => {
      if (Math.abs(t.amount - amount) >= AMOUNT_TOLERANCE) return false;
      if (!t.names.some((n) => named.includes(n))) return false;
      if (t.status === 'pending') return txn.transactionDate >= t.payableFrom;
      return Math.abs(Date.parse(t.date) - txnDay) / 86_400_000 <= MATCH_DATE_WINDOW_DAYS;
    });
    return candidates.length === 1 ? { transfer: candidates[0]!, byUtr: false } : null;
  }

  /** Settle the transfer at the bank figure if needed, then point the bank line at its JE. */
  async link(txn: SalaryDebit, bankAccountId: string, m: SalaryMatch): Promise<void> {
    const [payable] = await this.db.select({ id: accounts.id }).from(accounts)
      .where(and(eq(accounts.tenantId, this.tenantId), eq(accounts.code, SALARY_PAYABLE_CODE))).limit(1);
    const amount = parseFloat(txn.amount);
    const resettle = m.transfer.status === 'pending' || Math.abs(m.transfer.amount - amount) >= AMOUNT_TOLERANCE;
    await this.db.transaction(async (tx) => {
      const db = tx as unknown as Db;
      const journalEntryId = resettle
        ? await new SalaryTransferService(db, this.tenantId).settleFromBank(m.transfer.id, {
          amount, date: txn.transactionDate, bankAccountId, reference: m.transfer.reference,
        })
        : await this.journalEntryOf(db, m.transfer.id);
      await tx.insert(reconciliationMatches).values({
        tenantId: this.tenantId,
        bankTransactionId: txn.id,
        employeePaymentId: m.transfer.id,
        journalEntryId,
        matchType: m.byUtr ? 'auto_utr' : 'auto_amount_date',
      });
      await tx.update(bankTransactions)
        .set({ journalEntryId, glAccountId: payable?.id ?? null, reconStatus: 'matched', updatedAt: new Date() })
        .where(and(eq(bankTransactions.id, txn.id), eq(bankTransactions.tenantId, this.tenantId)));
    });
  }

  /** Link every salary debit with a transfer match; returns the ids it consumed. */
  async matchDebits(bankAccountId: string, debits: SalaryDebit[]): Promise<Set<string>> {
    const matched = new Set<string>();
    if (debits.length === 0) return matched;
    const pool = await this.loadOpen();
    if (pool.length === 0) return matched;
    const used = new Set<string>();
    for (const txn of debits) {
      const m = this.pick(txn, bankAccountId, pool, used);
      if (!m) continue;
      used.add(m.transfer.id);
      await this.link(txn, bankAccountId, m);
      matched.add(txn.id);
    }
    return matched;
  }

  private async journalEntryOf(db: Db, transferId: string): Promise<string> {
    const [row] = await db.select({ id: employeePayments.journalEntryId }).from(employeePayments)
      .where(and(eq(employeePayments.tenantId, this.tenantId), eq(employeePayments.id, transferId)));
    return row!.id!;
  }
}
