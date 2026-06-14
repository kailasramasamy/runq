import {
  pgTable, uuid, varchar, boolean, decimal, timestamp, index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { vendors } from '../ap/vendors';
import { mpNodeType, mpPayoutMode } from './enums';

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
