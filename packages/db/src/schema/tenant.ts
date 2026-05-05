import { pgTable, uuid, varchar, jsonb, timestamp, pgEnum, integer, text, index } from 'drizzle-orm/pg-core';

export const tenantStatusEnum = pgEnum('tenant_status', ['trial', 'active', 'past_due', 'suspended', 'churned']);

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  settings: jsonb('settings').notNull().default({}),
  status: tenantStatusEnum('status').notNull().default('trial'),
  planId: uuid('plan_id'),
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
  suspendedAt: timestamp('suspended_at', { withTimezone: true }),
  suspendedReason: text('suspended_reason'),
  mrrCents: integer('mrr_cents').notNull().default(0),
  lastActiveAt: timestamp('last_active_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  notes: text('notes'),
  // Short FY code (e.g. '2526' for FY 2025–26). Null means "use today's
  // date" — the FE derives the active FY from now() in that case.
  currentFy: varchar('current_fy', { length: 4 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_tenants_status').on(t.status),
  index('idx_tenants_last_active').on(t.lastActiveAt),
]);
