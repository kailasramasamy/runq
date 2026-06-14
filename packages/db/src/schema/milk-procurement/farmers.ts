import {
  pgTable, uuid, varchar, boolean, integer, date, timestamp, index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from '../tenant';
import { vendors } from '../ap/vendors';
import { documentAttachments } from '../common/attachments';
import { mpMilkType } from './enums';
import { mpNodes } from './nodes';

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
  isSociety: boolean('is_society').notNull().default(false),
  defaultMilkType: mpMilkType('default_milk_type').notNull().default('cow'),
  cattleCount: integer('cattle_count'),
  kycDocId: uuid('kyc_doc_id').references(() => documentAttachments.id),
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
