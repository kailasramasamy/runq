import { pgTable, uuid, varchar, boolean, timestamp, pgEnum, jsonb, text, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenant';

export const platformRoleEnum = pgEnum('platform_role', ['super_admin', 'support', 'billing_ops', 'read_only']);

export const platformUsers = pgTable('platform_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  role: platformRoleEnum('role').notNull().default('support'),
  isActive: boolean('is_active').notNull().default(true),
  mfaSecret: varchar('mfa_secret', { length: 255 }),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const platformAuditLog = pgTable('platform_audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  platformUserId: uuid('platform_user_id').references(() => platformUsers.id),
  action: varchar('action', { length: 80 }).notNull(),
  targetType: varchar('target_type', { length: 50 }).notNull(),
  targetId: uuid('target_id'),
  targetTenantId: uuid('target_tenant_id').references(() => tenants.id),
  metadata: jsonb('metadata'),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_pal_user_created').on(t.platformUserId, t.createdAt),
  index('idx_pal_target').on(t.targetType, t.targetId),
  index('idx_pal_tenant').on(t.targetTenantId, t.createdAt),
]);
