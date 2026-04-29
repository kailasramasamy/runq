import { pgTable, uuid, varchar, text, numeric, timestamp, pgEnum, index } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { bankTransactions } from './bank-transactions';

export const bankMatchActionEnum = pgEnum('bank_match_action', ['match', 'unmatch']);

export const bankMatchCorrections = pgTable('bank_match_corrections', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  bankTransactionId: uuid('bank_transaction_id').notNull().references(() => bankTransactions.id),
  narrationPattern: text('narration_pattern'),
  amount: numeric('amount', { precision: 15, scale: 2 }).notNull(),
  txnType: varchar('txn_type', { length: 10 }).notNull(),
  paymentId: uuid('payment_id'),
  receiptId: uuid('receipt_id'),
  vendorId: uuid('vendor_id'),
  customerId: uuid('customer_id'),
  action: bankMatchActionEnum('action').notNull(),
  actedBy: uuid('acted_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_bmc_pattern_vendor').on(t.tenantId, t.narrationPattern, t.vendorId),
  index('idx_bmc_pattern_customer').on(t.tenantId, t.narrationPattern, t.customerId),
  index('idx_bmc_tenant_txn').on(t.tenantId, t.bankTransactionId),
]);
