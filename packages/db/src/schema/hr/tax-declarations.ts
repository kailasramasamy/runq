import {
  pgTable, uuid, varchar, integer, decimal, text, timestamp, jsonb,
  pgEnum, index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { users } from '../user';
import { employees } from './employees';

export const declarationStatusEnum = pgEnum('declaration_status', [
  'draft', 'submitted', 'approved', 'rejected',
]);

export const taxRegimeEnum = pgEnum('tax_regime', ['old', 'new']);

// Form 12BB style investment declaration — one row per
// (employee, financial-year). Payroll TDS engine reads only `approved`
// rows. The detailed claims sit in `items`.
export const taxDeclarations = pgTable('tax_declarations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  employeeId: uuid('employee_id').notNull().references(() => employees.id),
  financialYear: varchar('financial_year', { length: 9 }).notNull(),
  regime: taxRegimeEnum('regime').notNull().default('new'),
  status: declarationStatusEnum('status').notNull().default('draft'),
  // Section totals — denormalised for quick TDS calc without joining items.
  hraTotal: decimal('hra_total', { precision: 12, scale: 2 }).notNull().default('0'),
  ltaTotal: decimal('lta_total', { precision: 12, scale: 2 }).notNull().default('0'),
  homeLoanInterest: decimal('home_loan_interest', { precision: 12, scale: 2 }).notNull().default('0'),
  section80c: decimal('section_80c', { precision: 12, scale: 2 }).notNull().default('0'),
  section80d: decimal('section_80d', { precision: 12, scale: 2 }).notNull().default('0'),
  section80g: decimal('section_80g', { precision: 12, scale: 2 }).notNull().default('0'),
  section80ccd1b: decimal('section_80ccd_1b', { precision: 12, scale: 2 }).notNull().default('0'),
  otherDeductions: decimal('other_deductions', { precision: 12, scale: 2 }).notNull().default('0'),
  notes: text('notes'),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  reviewedBy: uuid('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  rejectionReason: text('rejection_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_taxdecl_tenant_status').on(t.tenantId, t.status),
  uniqueIndex('uq_taxdecl_emp_fy').on(t.employeeId, t.financialYear),
]);

// Line-level proofs — one row per investment / rent / loan instrument.
// proofUrl is an S3 key; uploaded by employee, viewable by HR.
export const taxDeclarationItems = pgTable('tax_declaration_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  declarationId: uuid('declaration_id').notNull().references(() => taxDeclarations.id, { onDelete: 'cascade' }),
  section: varchar('section', { length: 30 }).notNull(),
  particulars: varchar('particulars', { length: 200 }).notNull(),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull().default('0'),
  meta: jsonb('meta').$type<Record<string, unknown>>(),
  proofUrl: varchar('proof_url', { length: 500 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_taxitem_decl').on(t.declarationId),
]);
