import { pgTable, uuid, varchar, date, decimal, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { bankAccounts } from '../banking/bank-accounts';
import { bankTransactions } from '../banking/bank-transactions';
import { paymentReceipts } from '../ar/receipts';

export const pgGatewayEnum = pgEnum('pg_gateway', ['razorpay', 'phonepe', 'paytm']);
export const pgMatchStatusEnum = pgEnum('pg_match_status', ['unmatched', 'matched', 'disputed']);

export const pgSettlements = pgTable('pg_settlements', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  gateway: pgGatewayEnum('gateway').notNull(),
  settlementId: varchar('settlement_id', { length: 100 }).notNull(),
  settlementDate: date('settlement_date').notNull(),
  grossAmount: decimal('gross_amount', { precision: 15, scale: 2 }).notNull(),
  totalFees: decimal('total_fees', { precision: 15, scale: 2 }).notNull(),
  totalTax: decimal('total_tax', { precision: 15, scale: 2 }).notNull().default('0'),
  netAmount: decimal('net_amount', { precision: 15, scale: 2 }).notNull(),
  bankAccountId: uuid('bank_account_id').references(() => bankAccounts.id),
  bankTransactionId: uuid('bank_transaction_id').references(() => bankTransactions.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const pgSettlementLines = pgTable('pg_settlement_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  settlementId: uuid('settlement_id').notNull().references(() => pgSettlements.id),
  orderId: varchar('order_id', { length: 100 }).notNull(),
  transactionId: varchar('transaction_id', { length: 100 }).notNull(),
  transactionDate: timestamp('transaction_date', { withTimezone: true }).notNull(),
  grossAmount: decimal('gross_amount', { precision: 15, scale: 2 }).notNull(),
  fee: decimal('fee', { precision: 15, scale: 2 }).notNull(),
  tax: decimal('tax', { precision: 15, scale: 2 }).notNull().default('0'),
  netAmount: decimal('net_amount', { precision: 15, scale: 2 }).notNull(),
  matchStatus: pgMatchStatusEnum('match_status').notNull().default('unmatched'),
  receiptId: uuid('receipt_id').references(() => paymentReceipts.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
