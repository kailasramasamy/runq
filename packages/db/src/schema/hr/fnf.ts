import {
  pgTable, uuid, varchar, decimal, date, text, timestamp, jsonb,
  pgEnum, index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { users } from '../user';
import { employees } from './employees';

export const fnfStatusEnum = pgEnum('fnf_status', [
  'draft', 'approved', 'paid', 'cancelled',
]);

// Full & Final settlement at exit. Co-exists with a normal monthly
// payroll run. Posts a separate JE on approval.
export const fnfSettlements = pgTable('fnf_settlements', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  employeeId: uuid('employee_id').notNull().references(() => employees.id),
  resignationDate: date('resignation_date'),
  lastWorkingDate: date('last_working_date').notNull(),
  noticePeriodDays: decimal('notice_period_days', { precision: 5, scale: 1 }),
  noticeShortfallDays: decimal('notice_shortfall_days', { precision: 5, scale: 1 }).notNull().default('0'),
  // Components (all positive contributions in INR)
  lastMonthSalary: decimal('last_month_salary', { precision: 15, scale: 2 }).notNull().default('0'),
  leaveEncashment: decimal('leave_encashment', { precision: 15, scale: 2 }).notNull().default('0'),
  gratuity: decimal('gratuity', { precision: 15, scale: 2 }).notNull().default('0'),
  bonusPayable: decimal('bonus_payable', { precision: 15, scale: 2 }).notNull().default('0'),
  otherEarnings: decimal('other_earnings', { precision: 15, scale: 2 }).notNull().default('0'),
  // Recoveries / deductions (positive numbers — subtracted from earnings)
  noticeRecovery: decimal('notice_recovery', { precision: 15, scale: 2 }).notNull().default('0'),
  loanRecovery: decimal('loan_recovery', { precision: 15, scale: 2 }).notNull().default('0'),
  tds: decimal('tds', { precision: 15, scale: 2 }).notNull().default('0'),
  pfDeduction: decimal('pf_deduction', { precision: 15, scale: 2 }).notNull().default('0'),
  otherDeductions: decimal('other_deductions', { precision: 15, scale: 2 }).notNull().default('0'),
  grossEarnings: decimal('gross_earnings', { precision: 15, scale: 2 }).notNull().default('0'),
  totalDeductions: decimal('total_deductions', { precision: 15, scale: 2 }).notNull().default('0'),
  netPayable: decimal('net_payable', { precision: 15, scale: 2 }).notNull().default('0'),
  status: fnfStatusEnum('status').notNull().default('draft'),
  notes: text('notes'),
  breakdown: jsonb('breakdown').$type<Record<string, unknown>>(),
  jeId: uuid('je_id'),
  approvedBy: uuid('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  pdfUrl: varchar('pdf_url', { length: 500 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_fnf_tenant_status').on(t.tenantId, t.status),
  uniqueIndex('uq_fnf_employee_active').on(t.employeeId),
]);
