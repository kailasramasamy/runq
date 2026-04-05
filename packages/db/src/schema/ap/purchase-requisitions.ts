import { pgTable, uuid, varchar, decimal, text, timestamp, pgEnum, index } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { users } from '../user';
import { vendors } from './vendors';
import { purchaseOrders } from './purchase-orders';

export const requisitionStatusEnum = pgEnum('requisition_status', ['draft', 'pending_approval', 'approved', 'rejected', 'converted']);

export const purchaseRequisitions = pgTable('purchase_requisitions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  requisitionNumber: varchar('requisition_number', { length: 50 }).notNull(),
  requestedBy: uuid('requested_by').notNull().references(() => users.id),
  vendorId: uuid('vendor_id').references(() => vendors.id),
  description: text('description').notNull(),
  totalAmount: decimal('total_amount', { precision: 15, scale: 2 }).notNull().default('0'),
  status: requisitionStatusEnum('status').notNull().default('draft'),
  approvedBy: uuid('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  poId: uuid('po_id').references(() => purchaseOrders.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index().on(t.tenantId, t.status),
]);

export const purchaseRequisitionItems = pgTable('purchase_requisition_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  requisitionId: uuid('requisition_id').notNull().references(() => purchaseRequisitions.id),
  itemName: varchar('item_name', { length: 255 }).notNull(),
  quantity: decimal('quantity', { precision: 12, scale: 3 }).notNull(),
  estimatedUnitPrice: decimal('estimated_unit_price', { precision: 15, scale: 2 }).notNull(),
  estimatedAmount: decimal('estimated_amount', { precision: 15, scale: 2 }).notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
