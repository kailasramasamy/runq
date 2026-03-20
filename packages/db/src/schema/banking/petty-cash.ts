import { pgTable, uuid, varchar, date, decimal, boolean, timestamp } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { bankTxnTypeEnum } from './bank-transactions';
import { users } from '../user';

export const pettyCashAccounts = pgTable('petty_cash_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  name: varchar('name', { length: 255 }).notNull(),
  location: varchar('location', { length: 255 }),
  cashLimit: decimal('cash_limit', { precision: 15, scale: 2 }).notNull(),
  currentBalance: decimal('current_balance', { precision: 15, scale: 2 }).notNull().default('0'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const pettyCashTransactions = pgTable('petty_cash_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  accountId: uuid('account_id').notNull().references(() => pettyCashAccounts.id),
  transactionDate: date('transaction_date').notNull(),
  type: bankTxnTypeEnum('type').notNull(),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  description: varchar('description', { length: 500 }).notNull(),
  category: varchar('category', { length: 100 }),
  approvedBy: uuid('approved_by').references(() => users.id),
  receiptUrl: varchar('receipt_url', { length: 500 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
