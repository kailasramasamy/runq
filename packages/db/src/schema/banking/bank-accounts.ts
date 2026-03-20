import { pgTable, uuid, varchar, decimal, boolean, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';

export const bankAccountTypeEnum = pgEnum('bank_account_type', ['current', 'savings', 'overdraft', 'cash_credit']);

export const bankAccounts = pgTable('bank_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  name: varchar('name', { length: 255 }).notNull(),
  bankName: varchar('bank_name', { length: 255 }).notNull(),
  accountNumber: varchar('account_number', { length: 30 }).notNull(),
  ifscCode: varchar('ifsc_code', { length: 11 }).notNull(),
  accountType: bankAccountTypeEnum('account_type').notNull().default('current'),
  openingBalance: decimal('opening_balance', { precision: 15, scale: 2 }).notNull().default('0'),
  currentBalance: decimal('current_balance', { precision: 15, scale: 2 }).notNull().default('0'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
