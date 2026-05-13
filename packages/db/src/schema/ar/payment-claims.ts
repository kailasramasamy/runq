import { pgTable, uuid, varchar, date, decimal, text, timestamp, pgEnum, primaryKey } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { customers } from './customers';
import { salesInvoices } from './invoices';
import { paymentReceipts } from './receipts';

export const customerPaymentClaimStatusEnum = pgEnum('customer_payment_claim_status', [
  'pending',
  'verified',
  'rejected',
  'cancelled',
]);

export const customerPaymentClaims = pgTable('customer_payment_claims', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  claimedAmount: decimal('claimed_amount', { precision: 15, scale: 2 }).notNull(),
  claimDate: date('claim_date').notNull(),
  paymentMethod: varchar('payment_method', { length: 40 }).notNull(),
  referenceNumber: varchar('reference_number', { length: 100 }),
  notes: text('notes'),
  status: customerPaymentClaimStatusEnum('status').notNull().default('pending'),
  matchedReceiptId: uuid('matched_receipt_id').references(() => paymentReceipts.id),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const customerPaymentClaimInvoices = pgTable(
  'customer_payment_claim_invoices',
  {
    claimId: uuid('claim_id').notNull().references(() => customerPaymentClaims.id, { onDelete: 'cascade' }),
    invoiceId: uuid('invoice_id').notNull().references(() => salesInvoices.id),
    amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.claimId, t.invoiceId] }) }),
);
