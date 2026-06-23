import {
  pgTable, uuid, varchar, boolean, decimal, timestamp, index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { vendors } from '../ap/vendors';
import { mpNodeType, mpPayoutMode, mpMeasurementMode, mpMilkType, mpCollectionShifts } from './enums';

/**
 * The collection network as a self-referencing tree: a VMCC's `parent` is its
 * CC, a CC's `parent` is its PP. `parent_node_id` is left as a plain uuid here
 * (self-FK declared in the SQL migration to avoid a circular reference).
 */
export const mpNodes = pgTable('mp_nodes', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  code: varchar('code', { length: 40 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  nodeType: mpNodeType('node_type').notNull(),
  parentNodeId: uuid('parent_node_id'),
  hasBmc: boolean('has_bmc').notNull().default(false),
  // CC dispatch pooling: true → pool is previous-day PM + today AM (milk chilled
  // overnight, sent with the next morning's collection); false → same-day AM+PM.
  // Only meaningful for CC nodes.
  overnightPooling: boolean('overnight_pooling').notNull().default(false),
  // milk-testing capability: `analyzer` (fat/SNF) or `lactometer` (CLR-only).
  // Only meaningful for VMCCs; CC/PP always test on an analyzer.
  measurementMode: mpMeasurementMode('measurement_mode').notNull().default('analyzer'),
  // Which shifts this VMCC collects in (both | am | pm). Drives the CC
  // receive-screen VMCC list. Only meaningful for VMCC nodes.
  collectionShifts: mpCollectionShifts('collection_shifts').notNull().default('both'),
  // The milk type(s) this VMCC collects. null/empty = all types (legacy). The
  // operator entry picker is restricted to these and hidden when only one.
  allowedMilkTypes: mpMilkType('allowed_milk_types').array(),
  // Pre-selected type at entry; must be one of allowedMilkTypes when both set.
  defaultMilkType: mpMilkType('default_milk_type'),
  capacityLitres: decimal('capacity_litres', { precision: 12, scale: 1 }),
  // null = inherit tenant default (mp_gl_settings.default_payout_mode)
  payoutMode: mpPayoutMode('payout_mode'),
  // the node's own payout identity — receives the bulk settlement in
  // `via_vmcc` mode, and commission/rent.
  payeeVendorId: uuid('payee_vendor_id').references(() => vendors.id),
  addressLine1: varchar('address_line1', { length: 255 }),
  addressLine2: varchar('address_line2', { length: 255 }),
  city: varchar('city', { length: 100 }),
  state: varchar('state', { length: 100 }),
  pincode: varchar('pincode', { length: 10 }),
  lat: decimal('lat', { precision: 10, scale: 7 }),
  lng: decimal('lng', { precision: 10, scale: 7 }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  uniqueIndex('uq_mp_nodes_tenant_code').on(t.tenantId, t.code),
  index('idx_mp_nodes_tenant_type').on(t.tenantId, t.nodeType),
  index('idx_mp_nodes_tenant_parent').on(t.tenantId, t.parentNodeId),
]);

export type MpNodeRow = typeof mpNodes.$inferSelect;
export type NewMpNodeRow = typeof mpNodes.$inferInsert;
