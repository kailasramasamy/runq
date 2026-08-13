import {
  pgTable, uuid, decimal, integer, text, timestamp, pgEnum, index,
} from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { users } from '../user';
import { employees } from './employees';
import { payrollRuns } from './payroll';

export const employeeDeductionCategoryEnum = pgEnum('employee_deduction_category', [
  'goods_purchase',  // employee bought company goods on credit
  'canteen',
  'damage',          // recovery for damaged/lost company property
  'uniform',
  'fine',
  'other',
]);

export const employeeDeductionStatusEnum = pgEnum('employee_deduction_status', [
  'active',     // still being recovered
  'recovered',  // outstanding hit zero
  'cancelled',  // written off / entered in error
]);

/**
 * A non-loan amount owed by an employee, recovered from payroll.
 *
 * Deliberately outstanding-driven rather than schedule-driven: `instalment`
 * is the most payroll may take in one run, and whatever it actually takes
 * comes off `outstanding`. A one-off recovery is just instalment == amount.
 * When a month's net pay can't absorb the full instalment, the shortfall
 * simply stays in `outstanding` and reappears next run — no rescheduling.
 *
 * Loans (`employee_loans`) keep their own materialised EMI schedule because
 * an employee needs to see the repayment plan up front; a canteen bill has
 * no such plan.
 */
export const employeeDeductions = pgTable('employee_deductions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  employeeId: uuid('employee_id').notNull().references(() => employees.id),
  category: employeeDeductionCategoryEnum('category').notNull().default('other'),
  description: text('description'),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  /** Ceiling on what a single payroll run may recover. */
  instalment: decimal('instalment', { precision: 15, scale: 2 }).notNull(),
  outstanding: decimal('outstanding', { precision: 15, scale: 2 }).notNull(),
  /** First run that may recover this. */
  startMonth: integer('start_month').notNull(),
  startYear: integer('start_year').notNull(),
  status: employeeDeductionStatusEnum('status').notNull().default('active'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_empded_tenant_status').on(t.tenantId, t.status),
  index('idx_empded_tenant_emp').on(t.tenantId, t.employeeId),
]);

/**
 * What a given payroll run actually recovered against a deduction.
 *
 * Payroll re-processes a draft run by wiping and rebuilding its payslips, so
 * recovery must be reversible: the run deletes its own rows here and adds
 * each amount back to `outstanding` before recalculating. Without this ledger
 * a second process() would silently double-recover.
 */
export const employeeDeductionRecoveries = pgTable('employee_deduction_recoveries', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  deductionId: uuid('deduction_id').notNull()
    .references(() => employeeDeductions.id, { onDelete: 'cascade' }),
  payrollRunId: uuid('payroll_run_id').notNull()
    .references(() => payrollRuns.id, { onDelete: 'cascade' }),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_eddedrec_run').on(t.tenantId, t.payrollRunId),
  index('idx_eddedrec_deduction').on(t.deductionId),
]);
