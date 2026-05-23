import {
  pgTable, uuid, varchar, decimal, date, text, timestamp, pgEnum, index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { customers } from '../ar/customers';
import { items } from '../masters/items';
import { warehouses } from './warehouses';

export const deliveryNoteStatusEnum = pgEnum('delivery_note_status', [
  'draft', 'dispatched', 'cancelled',
]);

export const deliveryNotes = pgTable(
  'delivery_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    dnNo: varchar('dn_no', { length: 40 }).notNull(),
    warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id),
    customerId: uuid('customer_id').references(() => customers.id),
    invoiceId: uuid('invoice_id'),
    soId: uuid('so_id'),
    dispatchDate: date('dispatch_date').notNull(),
    vehicleNo: varchar('vehicle_no', { length: 30 }),
    lrNo: varchar('lr_no', { length: 40 }),
    eWayBillNo: varchar('e_way_bill_no', { length: 30 }),
    notes: text('notes'),
    status: deliveryNoteStatusEnum('status').notNull().default('draft'),
    totalValue: decimal('total_value', { precision: 18, scale: 2 }).notNull().default('0'),
    journalEntryId: uuid('journal_entry_id'),
    cancelledJournalEntryId: uuid('cancelled_journal_entry_id'),
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by'),
  },
  (t) => [
    uniqueIndex('uq_dn_tenant_no').on(t.tenantId, t.dnNo),
    index('idx_dn_tenant_status').on(t.tenantId, t.status),
    index('idx_dn_tenant_wh').on(t.tenantId, t.warehouseId),
  ],
);

export const deliveryNoteLines = pgTable(
  'delivery_note_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    dnId: uuid('dn_id').notNull().references(() => deliveryNotes.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id').notNull().references(() => items.id),
    batchNo: varchar('batch_no', { length: 60 }),
    qty: decimal('qty', { precision: 18, scale: 3 }).notNull(),
    uom: varchar('uom', { length: 20 }),
    unitCost: decimal('unit_cost', { precision: 18, scale: 4 }).notNull().default('0'),
    lineTotal: decimal('line_total', { precision: 18, scale: 2 }).notNull().default('0'),
    notes: text('notes'),
  },
  (t) => [
    index('idx_dn_lines_dn').on(t.dnId),
    index('idx_dn_lines_item').on(t.tenantId, t.itemId),
  ],
);
