import {
  pgTable, uuid, varchar, text, timestamp, jsonb,
  pgEnum, index,
} from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { users } from '../user';
import { employees } from './employees';

export const letterKindEnum = pgEnum('letter_kind', [
  'offer', 'appointment', 'confirmation', 'increment',
  'experience', 'relieving', 'salary_certificate', 'address_proof', 'other',
]);

export const letterStatusEnum = pgEnum('letter_status', [
  'requested', 'draft', 'issued', 'revoked',
]);

// Tenant-level Handlebars-style template. `body` supports tokens like
// {{employee.firstName}}, {{salary.ctcAnnual}}, {{date.today}}, etc.
export const letterTemplates = pgTable('letter_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  name: varchar('name', { length: 100 }).notNull(),
  kind: letterKindEnum('kind').notNull(),
  subject: varchar('subject', { length: 200 }),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_lettertmpl_tenant').on(t.tenantId),
]);

// Concrete letter issued to an employee. `renderedBody` is a frozen snapshot.
export const employeeLetters = pgTable('employee_letters', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  employeeId: uuid('employee_id').notNull().references(() => employees.id),
  templateId: uuid('template_id').references(() => letterTemplates.id),
  kind: letterKindEnum('kind').notNull(),
  subject: varchar('subject', { length: 200 }),
  renderedBody: text('rendered_body').notNull(),
  tokens: jsonb('tokens').$type<Record<string, unknown>>(),
  status: letterStatusEnum('status').notNull().default('draft'),
  requestedReason: text('requested_reason'),
  issuedAt: timestamp('issued_at', { withTimezone: true }),
  issuedBy: uuid('issued_by').references(() => users.id),
  pdfUrl: varchar('pdf_url', { length: 500 }),
  emailedAt: timestamp('emailed_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_letter_tenant_emp').on(t.tenantId, t.employeeId),
  index('idx_letter_tenant_kind').on(t.tenantId, t.kind),
]);
