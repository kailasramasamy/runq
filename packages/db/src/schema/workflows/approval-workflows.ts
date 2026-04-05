import { pgTable, uuid, varchar, decimal, integer, boolean, text, timestamp, pgEnum, unique, index } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { users } from '../user';

export const approvalStatusEnum = pgEnum('approval_status', ['pending', 'approved', 'rejected']);
export const approvalStepStatusEnum = pgEnum('approval_step_status', ['pending', 'approved', 'rejected', 'skipped']);

export const approvalWorkflows = pgTable('approval_workflows', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  name: varchar('name', { length: 100 }).notNull(),
  entityType: varchar('entity_type', { length: 50 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique().on(t.tenantId, t.name),
]);

export const approvalRules = pgTable('approval_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  workflowId: uuid('workflow_id').notNull().references(() => approvalWorkflows.id),
  stepOrder: integer('step_order').notNull(),
  approverRole: varchar('approver_role', { length: 50 }).notNull(),
  minAmount: decimal('min_amount', { precision: 15, scale: 2 }),
  maxAmount: decimal('max_amount', { precision: 15, scale: 2 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index().on(t.tenantId, t.workflowId),
]);

export const approvalInstances = pgTable('approval_instances', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  workflowId: uuid('workflow_id').notNull().references(() => approvalWorkflows.id),
  entityType: varchar('entity_type', { length: 50 }).notNull(),
  entityId: uuid('entity_id').notNull(),
  status: approvalStatusEnum('status').notNull().default('pending'),
  requestedBy: uuid('requested_by').notNull().references(() => users.id),
  requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index().on(t.tenantId, t.entityType, t.entityId),
  index().on(t.tenantId, t.status),
]);

export const approvalSteps = pgTable('approval_steps', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  instanceId: uuid('instance_id').notNull().references(() => approvalInstances.id),
  ruleId: uuid('rule_id').notNull().references(() => approvalRules.id),
  stepOrder: integer('step_order').notNull(),
  status: approvalStepStatusEnum('status').notNull().default('pending'),
  assignedTo: uuid('assigned_to').references(() => users.id),
  assignedRole: varchar('assigned_role', { length: 50 }).notNull(),
  decidedBy: uuid('decided_by').references(() => users.id),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  comment: text('comment'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index().on(t.tenantId, t.instanceId),
]);
