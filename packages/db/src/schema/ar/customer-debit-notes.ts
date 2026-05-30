import { pgTable, uuid, varchar, date, decimal, text, timestamp, boolean, unique, index } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { customers } from './customers';
import { salesInvoices, taxCategoryEnum } from './invoices';
import { debitNoteStatusEnum } from '../ap/debit-notes';

// Customer-side debit notes (raised on customers who underpaid, or to correct
// under-billing on an invoice already in a filed GSTR-1). Mirrors creditNotes
// structure so the GSTR-1 generator treats both uniformly in the CDN section.
//
// Reuses debit_note_status enum from the vendor-side debit_notes table.
export const customerDebitNotes = pgTable('customer_debit_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  debitNoteNumber: varchar('debit_note_number', { length: 50 }).notNull(),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  invoiceId: uuid('invoice_id').references(() => salesInvoices.id),
  issueDate: date('issue_date').notNull(),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  reason: text('reason').notNull(),
  status: debitNoteStatusEnum('status').notNull().default('draft'),
  taxableValue: decimal('taxable_value', { precision: 15, scale: 2 }).notNull().default('0'),
  cgstAmount: decimal('cgst_amount', { precision: 15, scale: 2 }).notNull().default('0'),
  sgstAmount: decimal('sgst_amount', { precision: 15, scale: 2 }).notNull().default('0'),
  igstAmount: decimal('igst_amount', { precision: 15, scale: 2 }).notNull().default('0'),
  cessAmount: decimal('cess_amount', { precision: 15, scale: 2 }).notNull().default('0'),
  placeOfSupply: varchar('place_of_supply', { length: 100 }),
  placeOfSupplyCode: varchar('place_of_supply_code', { length: 2 }),
  isInterState: boolean('is_inter_state'),
  reverseCharge: boolean('reverse_charge').notNull().default(false),
  amendsInvoiceNumber: varchar('amends_invoice_number', { length: 50 }),
  amendsInvoiceDate: date('amends_invoice_date'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique().on(t.tenantId, t.debitNoteNumber),
  index('idx_cdn_tenant_customer').on(t.tenantId, t.customerId),
  index('idx_cdn_tenant_issue').on(t.tenantId, t.issueDate),
  index('idx_cdn_invoice').on(t.invoiceId),
]);

export const customerDebitNoteItems = pgTable('customer_debit_note_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  customerDebitNoteId: uuid('customer_debit_note_id').notNull().references(() => customerDebitNotes.id, { onDelete: 'cascade' }),
  itemId: uuid('item_id'),
  description: varchar('description', { length: 500 }).notNull(),
  uom: varchar('uom', { length: 20 }),
  packSizeValue: decimal('pack_size_value', { precision: 12, scale: 4 }).notNull().default('1'),
  packSizeUqc: varchar('pack_size_uqc', { length: 10 }),
  quantity: decimal('quantity', { precision: 12, scale: 3 }).notNull(),
  unitPrice: decimal('unit_price', { precision: 15, scale: 2 }).notNull(),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  hsnSacCode: varchar('hsn_sac_code', { length: 8 }),
  taxCategory: taxCategoryEnum('tax_category'),
  taxRate: decimal('tax_rate', { precision: 5, scale: 2 }),
  cgstRate: decimal('cgst_rate', { precision: 5, scale: 2 }).notNull().default('0'),
  cgstAmount: decimal('cgst_amount', { precision: 15, scale: 2 }).notNull().default('0'),
  sgstRate: decimal('sgst_rate', { precision: 5, scale: 2 }).notNull().default('0'),
  sgstAmount: decimal('sgst_amount', { precision: 15, scale: 2 }).notNull().default('0'),
  igstRate: decimal('igst_rate', { precision: 5, scale: 2 }).notNull().default('0'),
  igstAmount: decimal('igst_amount', { precision: 15, scale: 2 }).notNull().default('0'),
  cessRate: decimal('cess_rate', { precision: 5, scale: 2 }).notNull().default('0'),
  cessAmount: decimal('cess_amount', { precision: 15, scale: 2 }).notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_cdni_dn_id').on(t.customerDebitNoteId),
]);
