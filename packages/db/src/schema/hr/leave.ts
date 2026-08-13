import {
  pgTable, uuid, varchar, integer, text, decimal, date, boolean, timestamp,
  pgEnum, index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { users } from '../user';
import { employees } from './employees';

export const leaveRequestStatusEnum = pgEnum('leave_request_status', [
  'pending', 'approved', 'rejected', 'cancelled',
]);

export const leaveTypes = pgTable('leave_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  name: varchar('name', { length: 50 }).notNull(),
  code: varchar('code', { length: 10 }).notNull(),
  daysPerYear: decimal('days_per_year', { precision: 5, scale: 2 }).notNull().default('0'),
  // Drives the LeaveAccrualService. CHECK-constrained at the DB level
  // (mig 0089); typed loosely here so future modes (quarterly) don't
  // need a schema change to land.
  accrualMode: varchar('accrual_mode', { length: 20 }).notNull().default('upfront').$type<'upfront' | 'monthly' | 'quarterly'>(),
  // Gender eligibility filter for /hr/leave-balances. NULL-gender
  // employees see only 'all'-applicable types. CHECK-constrained in mig
  // 0090.
  applicableGender: varchar('applicable_gender', { length: 10 }).notNull().default('all').$type<'all' | 'male' | 'female'>(),
  carryForward: boolean('carry_forward').notNull().default(false),
  maxCarryForward: decimal('max_carry_forward', { precision: 5, scale: 2 }),
  // Ceiling on the *available* balance (opening + accrued − used) for
  // monthly-accrual types: once it's reached, accrual pauses and only
  // resumes as leave is taken. Stops an employee banking a whole year of
  // a high-frequency quota and cashing it in as one long absence.
  // NULL = uncapped, which is every type unless a tenant sets otherwise.
  maxBalance: decimal('max_balance', { precision: 5, scale: 2 }),
  // Hard ceiling on *paid* days in one calendar month, independent of the
  // balance. A banked balance says how much leave is available in total; this
  // says how much of it can be spent at once. Without it an employee sitting
  // on the maximum balance can take it all in a single month, which is the
  // behaviour the balance cap exists to prevent. NULL = no monthly limit.
  maxPaidDaysPerMonth: decimal('max_paid_days_per_month', { precision: 5, scale: 2 }),
  // When true, a request beyond the available balance is approved as a
  // split — paid up to the balance, the remainder unpaid (attendance
  // marked absent, so payroll's existing LOP derivation deducts it).
  // False keeps the old behaviour: the balance simply goes negative.
  overflowUnpaid: boolean('overflow_unpaid').notNull().default(false),
  encashable: boolean('encashable').notNull().default(false),
  isPaid: boolean('is_paid').notNull().default(true),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_lt_tenant').on(t.tenantId),
  uniqueIndex('uq_lt_tenant_code').on(t.tenantId, t.code),
]);

export const leaveBalances = pgTable('leave_balances', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  employeeId: uuid('employee_id').notNull().references(() => employees.id),
  leaveTypeId: uuid('leave_type_id').notNull().references(() => leaveTypes.id),
  year: integer('year').notNull(),
  opening: decimal('opening', { precision: 6, scale: 2 }).notNull().default('0'),
  accrued: decimal('accrued', { precision: 6, scale: 2 }).notNull().default('0'),
  used: decimal('used', { precision: 6, scale: 2 }).notNull().default('0'),
  // 0 = no accrual yet this year (fresh January); 12 = fully accrued.
  // The scheduler bumps this on monthly-mode rows; upfront rows stay at 12.
  lastAccruedMonth: integer('last_accrued_month').notNull().default(12),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_lb_tenant_emp').on(t.tenantId, t.employeeId),
  uniqueIndex('uq_lb_emp_type_year').on(t.employeeId, t.leaveTypeId, t.year),
]);

export const leaveRequests = pgTable('leave_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  employeeId: uuid('employee_id').notNull().references(() => employees.id),
  leaveTypeId: uuid('leave_type_id').notNull().references(() => leaveTypes.id),
  fromDate: date('from_date').notNull(),
  toDate: date('to_date').notNull(),
  halfDay: boolean('half_day').notNull().default(false),
  days: decimal('days', { precision: 5, scale: 2 }).notNull(),
  // Of `days`, how many were beyond the available balance and so approved
  // unpaid (see leaveTypes.overflowUnpaid). Kept on the request as the
  // audit trail for why a payslip shows LOP against approved leave.
  unpaidDays: decimal('unpaid_days', { precision: 5, scale: 2 }).notNull().default('0'),
  reason: text('reason'),
  status: leaveRequestStatusEnum('status').notNull().default('pending'),
  appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
  reviewedBy: uuid('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  rejectionReason: text('rejection_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_lr_tenant_status').on(t.tenantId, t.status),
  index('idx_lr_tenant_emp').on(t.tenantId, t.employeeId),
  index('idx_lr_tenant_dates').on(t.tenantId, t.fromDate, t.toDate),
]);
