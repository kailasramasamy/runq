import {
  pgTable, uuid, varchar, boolean, integer, decimal, jsonb, text, date, timestamp, index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from '../tenant';
import { vendors } from '../ap/vendors';
import { documentAttachments } from '../common/attachments';
import { mpMilkType } from './enums';
import { mpNodes } from './nodes';

/** Herd composition row stored in `cattle_breeds` JSON. `cattle_count` is the
 *  sum of `count` across rows; breed values are validated at the app layer. */
export type MpCattleBreed = { breed: string; count: number };

/**
 * Farmer / society master. Financial identity (bank, AP sub-ledger) is
 * delegated to a `vendors` row — bank details are NOT duplicated here.
 * KYC is stored by reference only (never raw Aadhaar).
 */
export const mpFarmers = pgTable('mp_farmers', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  vendorId: uuid('vendor_id').notNull().references(() => vendors.id),
  code: varchar('code', { length: 40 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 20 }),
  village: varchar('village', { length: 120 }),
  address: text('address'),
  // Government ID for KYC / subsidy linkage / cross-node de-dup. Stored raw
  // (v1); the supporting scan lives as a `farmer` document attachment.
  aadhaar: varchar('aadhaar', { length: 12 }),
  isSociety: boolean('is_society').notNull().default(false),
  defaultMilkType: mpMilkType('default_milk_type').notNull().default('cow'),
  // Herd: per-breed counts (JSON); `cattleCount` is their sum; `inMilkCount`
  // are those currently milking (dry = cattleCount − inMilkCount).
  cattleBreeds: jsonb('cattle_breeds').$type<MpCattleBreed[]>(),
  cattleCount: integer('cattle_count'),
  inMilkCount: integer('in_milk_count'),
  // Farm GPS pin captured by the operator on-site (route planning, verify).
  lat: decimal('lat', { precision: 10, scale: 7 }),
  lng: decimal('lng', { precision: 10, scale: 7 }),
  kycDocId: uuid('kyc_doc_id').references(() => documentAttachments.id),
  photoDocId: uuid('photo_doc_id').references(() => documentAttachments.id),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  uniqueIndex('uq_mp_farmers_tenant_code').on(t.tenantId, t.code),
  index('idx_mp_farmers_tenant_vendor').on(t.tenantId, t.vendorId),
  index('idx_mp_farmers_tenant_phone').on(t.tenantId, t.phone),
]);

/**
 * Farmer ↔ VMCC membership (many-to-many in schema, single-society in v1 UI).
 * `left_on IS NULL` = active; the partial unique index enforces one active
 * membership per (farmer, node).
 */
export const mpFarmerMemberships = pgTable('mp_farmer_memberships', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  farmerId: uuid('farmer_id').notNull().references(() => mpFarmers.id),
  nodeId: uuid('node_id').notNull().references(() => mpNodes.id),
  isPrimary: boolean('is_primary').notNull().default(true),
  joinedOn: date('joined_on'),
  leftOn: date('left_on'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('uq_mp_membership_active')
    .on(t.tenantId, t.farmerId, t.nodeId)
    .where(sql`${t.leftOn} IS NULL`),
  index('idx_mp_membership_node').on(t.tenantId, t.nodeId),
]);

export type MpFarmerRow = typeof mpFarmers.$inferSelect;
export type NewMpFarmerRow = typeof mpFarmers.$inferInsert;
