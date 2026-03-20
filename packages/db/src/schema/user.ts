import { pgTable, uuid, varchar, boolean, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from './tenant';

export const userRoleEnum = pgEnum('user_role', ['owner', 'accountant', 'viewer']);

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
