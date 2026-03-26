import { pgTable, uuid, varchar, integer, date, decimal, text, timestamp, pgEnum, unique, index, boolean } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { customers } from './customers';

export const taxCategoryEnum = pgEnum('tax_category', ['taxable', 'exempt', 'nil_rated', 'zero_rated', 'reverse_charge']);

export const salesInvoiceStatusEnum = pgEnum('sales_invoice_status', ['draft', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled']);

export const invoiceSequences = pgTable('invoice_sequences', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  financialYear: varchar('financial_year', { length: 10 }).notNull(),
  lastSequence: integer('last_sequence').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique().on(t.tenantId, t.financialYear),
]);

export const salesInvoices = pgTable('sales_invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  invoiceNumber: varchar('invoice_number', { length: 50 }).notNull(),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  invoiceDate: date('invoice_date').notNull(),
  dueDate: date('due_date').notNull(),
  subtotal: decimal('subtotal', { precision: 15, scale: 2 }).notNull(),
  taxAmount: decimal('tax_amount', { precision: 15, scale: 2 }).notNull().default('0'),
  totalAmount: decimal('total_amount', { precision: 15, scale: 2 }).notNull(),
  amountReceived: decimal('amount_received', { precision: 15, scale: 2 }).notNull().default('0'),
  balanceDue: decimal('balance_due', { precision: 15, scale: 2 }).notNull(),
  status: salesInvoiceStatusEnum('status').notNull().default('draft'),
  discountPercent: decimal('discount_percent', { precision: 5, scale: 2 }),
  discountDays: integer('discount_days'),
  notes: text('notes'),
  fileUrl: varchar('file_url', { length: 500 }),
  // GST fields
  placeOfSupply: varchar('place_of_supply', { length: 100 }),
  placeOfSupplyCode: varchar('place_of_supply_code', { length: 2 }),
  isInterState: boolean('is_inter_state'),
  cgstAmount: decimal('cgst_amount', { precision: 15, scale: 2 }).notNull().default('0'),
  sgstAmount: decimal('sgst_amount', { precision: 15, scale: 2 }).notNull().default('0'),
  igstAmount: decimal('igst_amount', { precision: 15, scale: 2 }).notNull().default('0'),
  cessAmount: decimal('cess_amount', { precision: 15, scale: 2 }).notNull().default('0'),
  reverseCharge: boolean('reverse_charge').notNull().default(false),
  // WMS integration
  wmsInvoiceId: varchar('wms_invoice_id', { length: 100 }),
  // IRN placeholder for e-invoicing (populated externally)
  irnNumber: varchar('irn_number', { length: 100 }),
  irnDate: date('irn_date'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_si_tenant_status').on(t.tenantId, t.status),
  index('idx_si_tenant_customer').on(t.tenantId, t.customerId),
  index('idx_si_tenant_due_date').on(t.tenantId, t.dueDate),
]);

export const salesInvoiceItems = pgTable('sales_invoice_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  invoiceId: uuid('invoice_id').notNull().references(() => salesInvoices.id, { onDelete: 'cascade' }),
  description: varchar('description', { length: 500 }).notNull(),
  quantity: decimal('quantity', { precision: 12, scale: 3 }).notNull(),
  unitPrice: decimal('unit_price', { precision: 15, scale: 2 }).notNull(),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  // GST fields per line item
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
});
