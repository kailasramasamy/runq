import {
  pgTable, uuid, varchar, decimal, date, text, timestamp,
  pgEnum, index,
} from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { users } from '../user';
import { employees } from './employees';
import { payrollRuns } from './payroll';
import { expenseClaims } from './expense-claims';
import { employeeRewards } from './rewards';
import { employeeLoans } from './loans';
import { bankAccounts } from '../banking/bank-accounts';
import { journalEntries } from '../gl/journal-entries';

export const employeePaymentSourceEnum = pgEnum('employee_payment_source', [
  'payroll_run',      // net pay disbursement against a run
  'expense_claim',    // reimbursement of an approved expense claim
  'employee_reward',  // payout of an approved monetary reward / spot bonus
  'employee_loan',    // disbursement of an approved salary advance / loan
]);

export const employeePaymentStatusEnum = pgEnum('employee_payment_status', [
  'pending',  // recorded but not yet posted to GL
  'paid',     // posted: settlement JE booked, reconcilable against the bank
]);

export const employeePaymentMethodEnum = pgEnum('employee_payment_method', [
  'bank_transfer', 'cash', 'cheque',
]);

/**
 * Money paid TO an employee — the payroll subledger's settlement primitive.
 *
 * Source is a payroll run (net pay batch), an approved expense claim
 * (reimbursement), or an approved monetary reward. On `paid`, the service
 * posts a journal entry that debits the source-specific payable (2110 Salary
 * Payable for payroll, 2111 Employee Reimbursements Payable for claims, 2114
 * Employee Rewards Payable for rewards) and credits the bank's GL account,
 * clearing the liability and producing a bank-reconcilable line.
 *
 * Employees do NOT live in the `vendors` table — payroll has its own payee.
 */
export const employeePayments = pgTable('employee_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),

  sourceType: employeePaymentSourceEnum('source_type').notNull(),
  payrollRunId: uuid('payroll_run_id').references(() => payrollRuns.id, { onDelete: 'set null' }),
  expenseClaimId: uuid('expense_claim_id').references(() => expenseClaims.id, { onDelete: 'set null' }),
  employeeRewardId: uuid('employee_reward_id').references(() => employeeRewards.id, { onDelete: 'set null' }),
  employeeLoanId: uuid('employee_loan_id').references(() => employeeLoans.id, { onDelete: 'set null' }),
  /** Nullable for a whole-run batch; populated for per-employee or reimbursement payments. */
  employeeId: uuid('employee_id').references(() => employees.id, { onDelete: 'set null' }),

  paymentDate: date('payment_date').notNull(),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  bankAccountId: uuid('bank_account_id').references(() => bankAccounts.id),
  paymentMethod: employeePaymentMethodEnum('payment_method').notNull().default('bank_transfer'),
  /** UTR / batch reference / cheque number — the customer's tie to their bank record. */
  reference: varchar('reference', { length: 100 }),

  status: employeePaymentStatusEnum('status').notNull().default('pending'),
  journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id),

  notes: text('notes'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_ep_tenant_status').on(t.tenantId, t.status),
  index('idx_ep_tenant_run').on(t.tenantId, t.payrollRunId),
  index('idx_ep_tenant_claim').on(t.tenantId, t.expenseClaimId),
  index('idx_ep_tenant_reward').on(t.tenantId, t.employeeRewardId),
  index('idx_ep_tenant_loan').on(t.tenantId, t.employeeLoanId),
]);
