import {
  pgTable, uuid, varchar, integer, decimal, date, text, timestamp,
  pgEnum, index, boolean, primaryKey,
} from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { users } from '../user';
import { employees } from './employees';
import { payrollRuns } from './payroll';

export const loanStatusEnum = pgEnum('loan_status', [
  'draft', 'requested', 'manager_approved', 'active', 'rejected',
  'closed', 'written_off',
]);

export const loanKindEnum = pgEnum('loan_kind', [
  'advance', 'personal', 'festival', 'education', 'other',
]);

// Salary advance / loan with EMI schedule. Payroll consumes the next-
// pending instalment each run.
export const employeeLoans = pgTable('employee_loans', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  employeeId: uuid('employee_id').notNull().references(() => employees.id),
  kind: loanKindEnum('kind').notNull().default('advance'),
  principal: decimal('principal', { precision: 15, scale: 2 }).notNull(),
  emiAmount: decimal('emi_amount', { precision: 15, scale: 2 }).notNull(),
  totalInstalments: integer('total_instalments').notNull(),
  disbursedOn: date('disbursed_on').notNull(),
  firstEmiMonth: integer('first_emi_month').notNull(),
  firstEmiYear: integer('first_emi_year').notNull(),
  outstanding: decimal('outstanding', { precision: 15, scale: 2 }).notNull(),
  status: loanStatusEnum('status').notNull().default('draft'),
  reason: text('reason'),
  rejectionReason: text('rejection_reason'),
  createdBy: uuid('created_by').references(() => users.id),
  approvedBy: uuid('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  managerApprovedBy: uuid('manager_approved_by').references(() => users.id),
  managerApprovedAt: timestamp('manager_approved_at', { withTimezone: true }),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_loan_tenant_status').on(t.tenantId, t.status),
  index('idx_loan_tenant_emp').on(t.tenantId, t.employeeId),
]);

// Per-tenant policy that governs the employee-initiated loan request flow.
// Default state has employeeRequestsEnabled=false so HR must explicitly
// opt-in before employees see the request UI in the app.
export const hrLoanPolicy = pgTable('hr_loan_policy', {
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  employeeRequestsEnabled: boolean('employee_requests_enabled').notNull().default(false),
  minTenureDays: integer('min_tenure_days').notNull().default(180),
  // Max principal as % of monthly CTC (ctc_annual / 12). e.g. 50 means
  // employee can request up to half a month's CTC.
  maxPctOfMonthlyCtc: integer('max_pct_of_monthly_ctc').notNull().default(50),
  maxActiveLoans: integer('max_active_loans').notNull().default(1),
  managerApprovalRequired: boolean('manager_approval_required').notNull().default(true),
  // null = all kinds allowed; otherwise comma-joined list of loan_kind values.
  allowedKinds: text('allowed_kinds'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.tenantId] }),
]);

// Materialised EMI schedule — one row per scheduled instalment.
// Payroll updates `paidPayrollRunId` + `paidAt` when it deducts.
export const employeeLoanInstalments = pgTable('employee_loan_instalments', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  loanId: uuid('loan_id').notNull().references(() => employeeLoans.id, { onDelete: 'cascade' }),
  sequence: integer('sequence').notNull(),
  dueMonth: integer('due_month').notNull(),
  dueYear: integer('due_year').notNull(),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  paidPayrollRunId: uuid('paid_payroll_run_id').references(() => payrollRuns.id),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_loaninst_loan_seq').on(t.loanId, t.sequence),
  index('idx_loaninst_tenant_due').on(t.tenantId, t.dueYear, t.dueMonth),
]);
