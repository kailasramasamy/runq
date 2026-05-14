import {
  pgTable, uuid, varchar, text, decimal, date, boolean, timestamp,
  pgEnum, index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { departments } from './departments';
import { designations } from './designations';

export const employmentTypeEnum = pgEnum('employment_type', [
  'permanent', 'contract', 'intern', 'consultant', 'wage',
]);

export const employeeStatusEnum = pgEnum('employee_status', [
  'active', 'inactive', 'terminated', 'on_leave',
]);

export const genderEnum = pgEnum('gender', ['male', 'female', 'other']);

export const employees = pgTable('employees', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),

  employeeCode: varchar('employee_code', { length: 30 }).notNull(),
  firstName: varchar('first_name', { length: 100 }).notNull(),
  lastName: varchar('last_name', { length: 100 }),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 20 }),
  dateOfBirth: date('date_of_birth'),
  gender: genderEnum('gender'),
  bloodGroup: varchar('blood_group', { length: 5 }),
  address: text('address'),

  joiningDate: date('joining_date').notNull(),
  confirmationDate: date('confirmation_date'),
  exitDate: date('exit_date'),
  status: employeeStatusEnum('status').notNull().default('active'),
  employmentType: employmentTypeEnum('employment_type').notNull().default('permanent'),

  branchId: uuid('branch_id'),
  departmentId: uuid('department_id').references(() => departments.id),
  designationId: uuid('designation_id').references(() => designations.id),
  reportingToId: uuid('reporting_to_id'),

  pan: varchar('pan', { length: 10 }),
  aadhaar: varchar('aadhaar', { length: 12 }),
  uan: varchar('uan', { length: 12 }),
  pfNumber: varchar('pf_number', { length: 30 }),
  esiNumber: varchar('esi_number', { length: 20 }),

  bankAccountNumber: varchar('bank_account_number', { length: 30 }),
  bankIfsc: varchar('bank_ifsc', { length: 11 }),
  bankName: varchar('bank_name', { length: 100 }),

  ctcAnnual: decimal('ctc_annual', { precision: 15, scale: 2 }),

  agency: varchar('agency', { length: 150 }),
  dailyWageRate: decimal('daily_wage_rate', { precision: 10, scale: 2 }),
  vendorId: uuid('vendor_id'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  index('idx_emp_tenant_status').on(t.tenantId, t.status),
  index('idx_emp_tenant_dept').on(t.tenantId, t.departmentId),
  uniqueIndex('uq_emp_tenant_code').on(t.tenantId, t.employeeCode),
]);
