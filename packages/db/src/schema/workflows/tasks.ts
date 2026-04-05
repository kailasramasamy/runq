import { pgTable, uuid, varchar, date, text, timestamp, pgEnum, index } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { users } from '../user';

export const taskStatusEnum = pgEnum('task_status', ['open', 'in_progress', 'completed', 'cancelled']);

export const taskAssignments = pgTable('task_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  entityType: varchar('entity_type', { length: 50 }).notNull(),
  entityId: uuid('entity_id').notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  assignedTo: uuid('assigned_to').notNull().references(() => users.id),
  assignedBy: uuid('assigned_by').notNull().references(() => users.id),
  dueDate: date('due_date'),
  status: taskStatusEnum('status').notNull().default('open'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index().on(t.tenantId, t.assignedTo, t.status),
  index().on(t.tenantId, t.entityType, t.entityId),
]);
