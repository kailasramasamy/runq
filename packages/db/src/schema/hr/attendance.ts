import {
  pgTable, uuid, varchar, integer, decimal, date, text, timestamp,
  pgEnum, jsonb, index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { users } from '../user';
import { employees } from './employees';
import { shifts } from './shifts';

export const attendanceStatusEnum = pgEnum('attendance_status', [
  'present', 'absent', 'half_day', 'leave', 'holiday', 'week_off',
]);

export const attendanceSourceEnum = pgEnum('attendance_source', [
  'manual', 'biometric', 'mobile', 'import',
]);

export const attendance = pgTable('attendance', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  employeeId: uuid('employee_id').notNull().references(() => employees.id),
  date: date('date').notNull(),
  shiftId: uuid('shift_id').references(() => shifts.id),
  checkIn: varchar('check_in', { length: 8 }),
  checkOut: varchar('check_out', { length: 8 }),
  hoursWorked: decimal('hours_worked', { precision: 5, scale: 2 }),
  otHours: decimal('ot_hours', { precision: 5, scale: 2 }),
  status: attendanceStatusEnum('status').notNull().default('present'),
  source: attendanceSourceEnum('source').notNull().default('manual'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_att_tenant_date').on(t.tenantId, t.date),
  index('idx_att_tenant_emp_date').on(t.tenantId, t.employeeId, t.date),
  uniqueIndex('uq_att_emp_date').on(t.employeeId, t.date),
]);

export const biometricImports = pgTable('biometric_imports', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  deviceType: varchar('device_type', { length: 50 }),
  importedBy: uuid('imported_by').notNull().references(() => users.id),
  importedAt: timestamp('imported_at', { withTimezone: true }).notNull().defaultNow(),
  totalRecords: integer('total_records').notNull().default(0),
  successCount: integer('success_count').notNull().default(0),
  errorCount: integer('error_count').notNull().default(0),
  errors: jsonb('errors').$type<Array<{ row: number; reason: string }>>().notNull().default([]),
}, (t) => [
  index('idx_bio_imp_tenant').on(t.tenantId),
]);
