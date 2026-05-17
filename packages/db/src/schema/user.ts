import { pgTable, uuid, varchar, boolean, timestamp, pgEnum, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenant';

// `hr` = People Ops persona. Tenant-wide read on HR data, full HR write,
// but no Finance write — narrower than `accountant`. Added in mig 0084.
export const userRoleEnum = pgEnum('user_role', ['owner', 'accountant', 'viewer', 'client_owner', 'hr']);

export const inviteTypeEnum = pgEnum('invite_type', ['new_tenant', 'join_tenant']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  email: varchar('email', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  role: userRoleEnum('role').notNull().default('viewer'),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const userTenants = pgTable(
  'user_tenants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    role: userRoleEnum('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userTenantUnique: uniqueIndex('user_tenants_user_tenant_unique').on(t.userId, t.tenantId),
    userIdx: index('user_tenants_user_idx').on(t.userId),
    tenantIdx: index('user_tenants_tenant_idx').on(t.tenantId),
  }),
);

// Phase 1: CA invite flow. A CA generates an invite link, sends to a prospective
// client. The client signs up via the link, which creates their tenant + owner
// user, and attaches the inviting CA to the new tenant as `accountant`.
export const tenantInvites = pgTable(
  'tenant_invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    token: varchar('token', { length: 64 }).notNull(),
    invitingUserId: uuid('inviting_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    invitingTenantId: uuid('inviting_tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    inviteType: inviteTypeEnum('invite_type').notNull().default('new_tenant'),
    role: userRoleEnum('role').notNull().default('accountant'),
    email: varchar('email', { length: 255 }),
    // For new_tenant invites: CA can pre-set the prospective client's company
    // name so the accept page is one step shorter and avoids typos.
    companyName: varchar('company_name', { length: 255 }),
    note: varchar('note', { length: 500 }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    acceptedTenantId: uuid('accepted_tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tokenUnique: uniqueIndex('tenant_invites_token_unique').on(t.token),
    invitingUserIdx: index('tenant_invites_inviting_user_idx').on(t.invitingUserId),
  }),
);
