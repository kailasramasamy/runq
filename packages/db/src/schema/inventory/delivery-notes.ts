import {
  pgTable, uuid, varchar, decimal, date, text, timestamp, pgEnum, index, uniqueIndex, boolean,
} from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { customers } from '../ar/customers';
import { items } from '../masters/items';
import { warehouses } from './warehouses';

export const deliveryNoteStatusEnum = pgEnum('delivery_note_status', [
  'draft', 'dispatched', 'cancelled',
]);

/**
 * A sales return is the inverse of a dispatch, so it reuses this document
 * rather than a parallel table. Returns always carry `returnOfDnId` — the
 * inbound cost is read off the original dispatch line, never re-derived.
 */
export const deliveryNoteDirectionEnum = pgEnum('delivery_note_direction', [
  'out', 'in',
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
    direction: deliveryNoteDirectionEnum('direction').notNull().default('out'),
    creditNoteId: uuid('credit_note_id'),
    returnOfDnId: uuid('return_of_dn_id'),
    dispatchDate: date('dispatch_date').notNull(),
    vehicleNo: varchar('vehicle_no', { length: 30 }),
    lrNo: varchar('lr_no', { length: 40 }),
    eWayBillNo: varchar('e_way_bill_no', { length: 30 }),
    notes: text('notes'),
    status: deliveryNoteStatusEnum('status').notNull().default('draft'),
    totalValue: decimal('total_value', { precision: 18, scale: 2 }).notNull().default('0'),
    /**
     * The remainder auto-dispatch could not cover, parked for a human. Only
     * ever true on a draft: posting it clears the shortage by definition.
     */
    isShortfall: boolean('is_shortfall').notNull().default(false),
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
    index('idx_dn_tenant_invoice').on(t.tenantId, t.invoiceId),
    index('idx_dn_tenant_direction').on(t.tenantId, t.direction),
    index('idx_dn_return_of').on(t.returnOfDnId),
    // idx_dn_open_shortfall is partial (is_shortfall AND status='draft') and
    // lives only in migration 0203 — drizzle-kit push chokes on expression
    // indexes and takes the container down with it.
  ],
);

export const deliveryNoteLines = pgTable(
  'delivery_note_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    dnId: uuid('dn_id').notNull().references(() => deliveryNotes.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id').notNull().references(() => items.id),
    // Set when the line came from an AR invoice. Dispatched-vs-invoiced qty is
    // computed off this, so partial dispatch works and over-dispatch is caught.
    invoiceLineId: uuid('invoice_line_id'),
    /**
     * Set when this line ships a different item than its invoice line billed.
     * The line draws and costs its own `itemId` — what physically left — and
     * this records the item it was sent against, so the invoice line still
     * clears and the swap stays visible on the document.
     */
    substitutedForItemId: uuid('substituted_for_item_id').references(() => items.id),
    substitutionNote: text('substitution_note'),
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
    index('idx_dnl_invoice_line').on(t.invoiceLineId),
  ],
);
