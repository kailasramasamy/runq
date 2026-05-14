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
  carryForward: boolean('carry_forward').notNull().default(false),
  maxCarryForward: decimal('max_carry_forward', { precision: 5, scale: 2 }),
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
