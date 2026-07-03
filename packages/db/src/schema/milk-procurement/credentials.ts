import {
  pgTable, uuid, varchar, date, integer, boolean, timestamp, index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { users } from '../user';
import { mpFarmers } from './farmers';
import { mpCredentialRole } from './enums';

/**
 * Dhenu app login identity — **independent of HR `employees` auth**. Farmers and
 * field operators bind here by phone + DOB (DDMMYY), then link Google/Apple;
 * neither persona is an employee. On first successful login a `users` row (role
 * `farmer` | `field_operator`) is minted/linked for the JWT + tenant membership;
 * `user_id` points at it once it exists.
 *
 * Keyed by (tenant, phone). `firebase_uid` is set on the one-time social bind
 * (partial-unique in SQL only — drizzle-kit push chokes on WHERE, see
 * project_prod_setup). `bind_attempts` throttles the DOB gate (5 → locked).
 */
export const mpCredentials = pgTable('mp_credentials', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  phone: varchar('phone', { length: 20 }).notNull(),
  dateOfBirth: date('date_of_birth'),
  role: mpCredentialRole('role').notNull(),
  // Set for `farmer` credentials; null for operators (resolved via mp_node_operators).
  farmerId: uuid('farmer_id').references(() => mpFarmers.id),
  // Null until the first login mints/links the backing runq user.
  userId: uuid('user_id').references(() => users.id),
  firebaseUid: varchar('firebase_uid', { length: 128 }),
  authProvider: varchar('auth_provider', { length: 20 }),
  bindAttempts: integer('bind_attempts').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('uq_mp_credentials_tenant_phone').on(t.tenantId, t.phone),
  index('idx_mp_credentials_phone').on(t.phone),
  index('idx_mp_credentials_farmer').on(t.farmerId),
]);

export type MpCredentialRow = typeof mpCredentials.$inferSelect;
export type NewMpCredentialRow = typeof mpCredentials.$inferInsert;

/**
 * Social identities linked to a credential — one row per provider, so a single
 * Dhenu account can sign in with BOTH Google and Apple (each is a distinct
 * Firebase uid). `firebase_uid` is globally unique (an identity maps to exactly
 * one account); `(credential_id, provider)` is unique so re-linking the same
 * provider updates the uid rather than piling up rows.
 */
export const mpCredentialIdentities = pgTable('mp_credential_identities', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  credentialId: uuid('credential_id').notNull().references(() => mpCredentials.id),
  firebaseUid: varchar('firebase_uid', { length: 128 }).notNull(),
  provider: varchar('provider', { length: 20 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('uq_mp_cred_identities_uid').on(t.firebaseUid),
  uniqueIndex('uq_mp_cred_identities_cred_provider').on(t.credentialId, t.provider),
  index('idx_mp_cred_identities_cred').on(t.credentialId),
]);

export type MpCredentialIdentityRow = typeof mpCredentialIdentities.$inferSelect;
