import {
  pgTable, uuid, varchar, integer, boolean, date, timestamp,
  jsonb, index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { employees } from './employees';

export const shifts = pgTable('shifts', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  name: varchar('name', { length: 50 }).notNull(),
  startTime: varchar('start_time', { length: 5 }).notNull(),
  endTime: varchar('end_time', { length: 5 }).notNull(),
  breakMinutes: integer('break_minutes').notNull().default(0),
  weeklyOffDays: jsonb('weekly_off_days').$type<number[]>().notNull().default([0]),
  isNightShift: boolean('is_night_shift').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_shift_tenant').on(t.tenantId),
  uniqueIndex('uq_shift_tenant_name').on(t.tenantId, t.name),
]);

export const employeeShifts = pgTable('employee_shifts', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  employeeId: uuid('employee_id').notNull().references(() => employees.id),
  shiftId: uuid('shift_id').notNull().references(() => shifts.id),
  effectiveFrom: date('effective_from').notNull(),
  effectiveTo: date('effective_to'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_eshift_tenant_emp').on(t.tenantId, t.employeeId),
]);
