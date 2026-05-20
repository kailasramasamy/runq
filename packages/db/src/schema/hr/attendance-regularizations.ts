import {
  pgTable, uuid, varchar, date, text, timestamp,
  pgEnum, index,
} from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { users } from '../user';
import { employees } from './employees';

export const regularizationStatusEnum = pgEnum('regularization_status', [
  'pending', 'approved', 'rejected', 'cancelled',
]);

// Employee request to fix an attendance row — missed punch, wrong shift,
// system absence on a working day. Approval triggers an update to the
// matching `attendance` row.
export const attendanceRegularizations = pgTable('attendance_regularizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  employeeId: uuid('employee_id').notNull().references(() => employees.id),
  date: date('date').notNull(),
  requestedCheckIn: varchar('requested_check_in', { length: 8 }),
  requestedCheckOut: varchar('requested_check_out', { length: 8 }),
  requestedStatus: varchar('requested_status', { length: 20 }),
  reason: text('reason').notNull(),
  status: regularizationStatusEnum('status').notNull().default('pending'),
  reviewedBy: uuid('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  rejectionReason: text('rejection_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_reg_tenant_status').on(t.tenantId, t.status),
  index('idx_reg_tenant_emp').on(t.tenantId, t.employeeId),
]);
