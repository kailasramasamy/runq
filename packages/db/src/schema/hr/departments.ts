import { pgTable, uuid, varchar, boolean, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';

export const departments = pgTable('departments', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  name: varchar('name', { length: 100 }).notNull(),
  code: varchar('code', { length: 20 }),
  parentId: uuid('parent_id'),
  // Optional dept head — when set, that employee sees everyone in this
  // department even if they're not their direct reports (mig 0085).
  // Plain `uuid` rather than a FK to employees.id to dodge a circular
  // schema cycle (employees.departmentId already points here).
  headEmployeeId: uuid('head_employee_id'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_dept_tenant').on(t.tenantId),
  uniqueIndex('uq_dept_tenant_name').on(t.tenantId, t.name),
  // Used by hrAccessScope to find dept-head expansions for a logged-in user.
  index('idx_dept_tenant_head').on(t.tenantId, t.headEmployeeId),
]);
