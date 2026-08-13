import {
  pgTable, uuid, varchar, integer, decimal, text, boolean, timestamp,
  pgEnum, jsonb, index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { users } from '../user';
import { employees } from './employees';

export const componentTypeEnum = pgEnum('salary_component_type', [
  'earning', 'deduction', 'reimbursement', 'statutory',
]);

export const calcTypeEnum = pgEnum('salary_calc_type', [
  'fixed', 'percent_of_basic', 'percent_of_ctc', 'formula',
]);

export const payrollRunStatusEnum = pgEnum('payroll_run_status', [
  'draft', 'processed', 'approved', 'closed',
]);

export const salaryComponents = pgTable('salary_components', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  name: varchar('name', { length: 50 }).notNull(),
  code: varchar('code', { length: 20 }).notNull(),
  type: componentTypeEnum('type').notNull().default('earning'),
  calcType: calcTypeEnum('calc_type').notNull().default('fixed'),
  defaultValue: decimal('default_value', { precision: 12, scale: 2 }).notNull().default('0'),
  isTaxable: boolean('is_taxable').notNull().default(true),
  isPfApplicable: boolean('is_pf_applicable').notNull().default(false),
  isEsiApplicable: boolean('is_esi_applicable').notNull().default(false),
  displayOrder: integer('display_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_sc_tenant').on(t.tenantId),
  uniqueIndex('uq_sc_tenant_code').on(t.tenantId, t.code),
]);

export const salaryStructures = pgTable('salary_structures', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_ss_tenant').on(t.tenantId),
  uniqueIndex('uq_ss_tenant_name').on(t.tenantId, t.name),
]);

export const salaryStructureComponents = pgTable('salary_structure_components', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  salaryStructureId: uuid('salary_structure_id').notNull().references(() => salaryStructures.id, { onDelete: 'cascade' }),
  salaryComponentId: uuid('salary_component_id').notNull().references(() => salaryComponents.id),
  value: decimal('value', { precision: 12, scale: 2 }).notNull().default('0'),
  calcType: calcTypeEnum('calc_type').notNull().default('fixed'),
}, (t) => [
  index('idx_ssc_tenant_struct').on(t.tenantId, t.salaryStructureId),
]);

export const employeeSalary = pgTable('employee_salary', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  employeeId: uuid('employee_id').notNull().references(() => employees.id),
  salaryStructureId: uuid('salary_structure_id').references(() => salaryStructures.id),
  ctcAnnual: decimal('ctc_annual', { precision: 15, scale: 2 }).notNull(),
  effectiveFrom: varchar('effective_from', { length: 10 }).notNull(),
  effectiveTo: varchar('effective_to', { length: 10 }),
  /** Frozen snapshot of components at assignment time (handles structure edits later). */
  componentsSnapshot: jsonb('components_snapshot').$type<Array<{
    componentId: string; code: string; name: string;
    type: string; calcType: string; value: number;
  }>>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_es_tenant_emp').on(t.tenantId, t.employeeId),
]);

export const payrollRuns = pgTable('payroll_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  month: integer('month').notNull(), // 1-12
  year: integer('year').notNull(),
  status: payrollRunStatusEnum('status').notNull().default('draft'),
  totalEmployees: integer('total_employees').notNull().default(0),
  totalGross: decimal('total_gross', { precision: 15, scale: 2 }).notNull().default('0'),
  totalDeductions: decimal('total_deductions', { precision: 15, scale: 2 }).notNull().default('0'),
  totalNet: decimal('total_net', { precision: 15, scale: 2 }).notNull().default('0'),
  processedBy: uuid('processed_by').references(() => users.id),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  approvedBy: uuid('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_pr_tenant_status').on(t.tenantId, t.status),
  uniqueIndex('uq_pr_tenant_month').on(t.tenantId, t.year, t.month),
]);

export const payslips = pgTable('payslips', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  payrollRunId: uuid('payroll_run_id').notNull().references(() => payrollRuns.id, { onDelete: 'cascade' }),
  employeeId: uuid('employee_id').notNull().references(() => employees.id),
  workingDays: decimal('working_days', { precision: 5, scale: 2 }).notNull().default('0'),
  presentDays: decimal('present_days', { precision: 5, scale: 2 }).notNull().default('0'),
  lopDays: decimal('lop_days', { precision: 5, scale: 2 }).notNull().default('0'),
  paidDays: decimal('paid_days', { precision: 5, scale: 2 }).notNull().default('0'),
  // The actual dates behind lopDays — days marked absent or half-day in the
  // month. Stored rather than derived so a payslip stays a faithful record of
  // what was paid, even if attendance is edited afterwards. "Why is my salary
  // short?" is answerable from the payslip alone.
  lopDates: jsonb('lop_dates').$type<string[]>().notNull().default([]),
  // Wages actually earned this month: gross less the unpaid days. `gross` is
  // the full contracted figure the payslip leads with, and LOP appears as a
  // deduction beneath it — the conventional Indian payslip. Statutory bases
  // (PF/ESI/PT/TDS), the GL salary expense and the registers all follow this
  // column instead, because contributions are due on wages paid, not on the
  // contracted amount.
  paidWages: decimal('paid_wages', { precision: 12, scale: 2 }).notNull().default('0'),
  otHours: decimal('ot_hours', { precision: 6, scale: 2 }).notNull().default('0'),
  /** Per-component breakdown: `[{code, name, type, amount}, ...]` */
  earnings: jsonb('earnings').$type<Array<{ code: string; name: string; amount: number }>>().notNull().default([]),
  deductions: jsonb('deductions').$type<Array<{ code: string; name: string; amount: number }>>().notNull().default([]),
  gross: decimal('gross', { precision: 15, scale: 2 }).notNull().default('0'),
  totalDeductions: decimal('total_deductions', { precision: 15, scale: 2 }).notNull().default('0'),
  netPay: decimal('net_pay', { precision: 15, scale: 2 }).notNull().default('0'),
  pfEmployee: decimal('pf_employee', { precision: 12, scale: 2 }).notNull().default('0'),
  pfEmployer: decimal('pf_employer', { precision: 12, scale: 2 }).notNull().default('0'),
  esiEmployee: decimal('esi_employee', { precision: 12, scale: 2 }).notNull().default('0'),
  esiEmployer: decimal('esi_employer', { precision: 12, scale: 2 }).notNull().default('0'),
  tds: decimal('tds', { precision: 12, scale: 2 }).notNull().default('0'),
  pt: decimal('pt', { precision: 12, scale: 2 }).notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_ps_tenant_run').on(t.tenantId, t.payrollRunId),
  uniqueIndex('uq_ps_run_employee').on(t.payrollRunId, t.employeeId),
]);
