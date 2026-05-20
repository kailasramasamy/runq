import {
  pgTable, uuid, varchar, integer, boolean, text, timestamp,
  pgEnum, index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { users } from '../user';
import { employees } from './employees';
import { documentAttachments } from '../common/attachments';

export const onboardingStatusEnum = pgEnum('onboarding_status', [
  'in_progress', 'completed', 'cancelled',
]);

export const onboardingItemKindEnum = pgEnum('onboarding_item_kind', [
  'document_upload', 'task', 'acknowledgement', 'asset_issue', 'induction',
]);

// Reusable template — a checklist that can be applied to every new hire.
export const onboardingTemplates = pgTable('onboarding_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_onbtmpl_tenant').on(t.tenantId),
]);

export const onboardingTemplateItems = pgTable('onboarding_template_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  templateId: uuid('template_id').notNull().references(() => onboardingTemplates.id, { onDelete: 'cascade' }),
  sequence: integer('sequence').notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  kind: onboardingItemKindEnum('kind').notNull().default('task'),
  assignedRole: varchar('assigned_role', { length: 30 }).notNull().default('employee'),
  documentKind: varchar('document_kind', { length: 40 }),
  dueDays: integer('due_days'),
  instructions: text('instructions'),
}, (t) => [
  index('idx_onbtmplitem_tmpl').on(t.templateId),
]);

// Per-employee instance of an onboarding workflow.
export const onboardingWorkflows = pgTable('onboarding_workflows', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  employeeId: uuid('employee_id').notNull().references(() => employees.id),
  templateId: uuid('template_id').references(() => onboardingTemplates.id),
  status: onboardingStatusEnum('status').notNull().default('in_progress'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('uq_onbwf_employee').on(t.employeeId),
  index('idx_onbwf_tenant_status').on(t.tenantId, t.status),
]);

export const onboardingItems = pgTable('onboarding_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  workflowId: uuid('workflow_id').notNull().references(() => onboardingWorkflows.id, { onDelete: 'cascade' }),
  sequence: integer('sequence').notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  kind: onboardingItemKindEnum('kind').notNull().default('task'),
  assignedRole: varchar('assigned_role', { length: 30 }).notNull().default('employee'),
  documentKind: varchar('document_kind', { length: 40 }),
  attachmentId: uuid('attachment_id').references(() => documentAttachments.id),
  instructions: text('instructions'),
  isCompleted: boolean('is_completed').notNull().default(false),
  completedBy: uuid('completed_by').references(() => users.id),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  notes: text('notes'),
}, (t) => [
  index('idx_onbitem_workflow').on(t.workflowId),
]);
