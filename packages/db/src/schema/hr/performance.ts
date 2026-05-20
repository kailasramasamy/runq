import {
  pgTable, uuid, varchar, integer, decimal, date, text, timestamp,
  pgEnum, index,
} from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { users } from '../user';
import { employees } from './employees';

export const cycleStatusEnum = pgEnum('perf_cycle_status', [
  'planned', 'active', 'review', 'closed',
]);

export const goalStatusEnum = pgEnum('perf_goal_status', [
  'draft', 'active', 'achieved', 'partially_achieved', 'not_achieved', 'dropped',
]);

export const reviewStatusEnum = pgEnum('perf_review_status', [
  'pending', 'self_submitted', 'manager_submitted', 'finalised', 'acknowledged',
]);

// A performance review window: annual, half-yearly, quarterly.
export const performanceCycles = pgTable('performance_cycles', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  name: varchar('name', { length: 100 }).notNull(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  reviewStartDate: date('review_start_date'),
  reviewEndDate: date('review_end_date'),
  status: cycleStatusEnum('status').notNull().default('planned'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_perfcycle_tenant').on(t.tenantId),
]);

// Per-employee goals for a cycle. weight is 0..100; the goal sheet
// validation enforces sum = 100.
export const performanceGoals = pgTable('performance_goals', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  cycleId: uuid('cycle_id').notNull().references(() => performanceCycles.id),
  employeeId: uuid('employee_id').notNull().references(() => employees.id),
  title: varchar('title', { length: 200 }).notNull(),
  description: text('description'),
  weight: decimal('weight', { precision: 5, scale: 2 }).notNull().default('0'),
  targetMetric: varchar('target_metric', { length: 200 }),
  status: goalStatusEnum('status').notNull().default('active'),
  // Mid-cycle progress 0-100, updatable by the employee any time.
  progressPct: integer('progress_pct'),
  selfRating: decimal('self_rating', { precision: 3, scale: 1 }),
  managerRating: decimal('manager_rating', { precision: 3, scale: 1 }),
  finalRating: decimal('final_rating', { precision: 3, scale: 1 }),
  comments: text('comments'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_perfgoal_cycle_emp').on(t.cycleId, t.employeeId),
  index('idx_perfgoal_tenant_emp').on(t.tenantId, t.employeeId),
]);

// The wrap-up review per (cycle, employee). Aggregates goal ratings.
export const performanceReviews = pgTable('performance_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  cycleId: uuid('cycle_id').notNull().references(() => performanceCycles.id),
  employeeId: uuid('employee_id').notNull().references(() => employees.id),
  managerUserId: uuid('manager_user_id').references(() => users.id),
  selfComments: text('self_comments'),
  managerComments: text('manager_comments'),
  selfOverallRating: decimal('self_overall_rating', { precision: 3, scale: 1 }),
  managerOverallRating: decimal('manager_overall_rating', { precision: 3, scale: 1 }),
  finalOverallRating: decimal('final_overall_rating', { precision: 3, scale: 1 }),
  status: reviewStatusEnum('status').notNull().default('pending'),
  selfSubmittedAt: timestamp('self_submitted_at', { withTimezone: true }),
  managerSubmittedAt: timestamp('manager_submitted_at', { withTimezone: true }),
  finalisedAt: timestamp('finalised_at', { withTimezone: true }),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  employeeAckComment: text('employee_ack_comment'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_perfreview_cycle_emp').on(t.cycleId, t.employeeId),
  index('idx_perfreview_tenant_status').on(t.tenantId, t.status),
]);
