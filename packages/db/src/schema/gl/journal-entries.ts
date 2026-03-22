import { pgTable, uuid, varchar, date, decimal, text, timestamp, pgEnum, index, unique, integer } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { users } from '../user';
import { accounts } from './accounts';

export const journalEntryStatusEnum = pgEnum('journal_entry_status', ['draft', 'posted', 'reversed']);

export const journalSequences = pgTable('journal_sequences', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  financialYear: varchar('financial_year', { length: 10 }).notNull(),
  lastSequence: integer('last_sequence').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique().on(t.tenantId, t.financialYear),
]);

export const journalEntries = pgTable('journal_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  entryNumber: varchar('entry_number', { length: 50 }).notNull(),
  date: date('date').notNull(),
  description: text('description').notNull(),
  status: journalEntryStatusEnum('status').notNull().default('posted'),
  sourceType: varchar('source_type', { length: 50 }),
  sourceId: uuid('source_id'),
  totalDebit: decimal('total_debit', { precision: 15, scale: 2 }).notNull(),
  totalCredit: decimal('total_credit', { precision: 15, scale: 2 }).notNull(),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique().on(t.tenantId, t.entryNumber),
  index().on(t.tenantId, t.date),
  index().on(t.tenantId, t.sourceType, t.sourceId),
]);

export const journalLines = pgTable('journal_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  journalEntryId: uuid('journal_entry_id').notNull().references(() => journalEntries.id),
  accountId: uuid('account_id').notNull().references(() => accounts.id),
  debit: decimal('debit', { precision: 15, scale: 2 }).notNull().default('0'),
  credit: decimal('credit', { precision: 15, scale: 2 }).notNull().default('0'),
  description: varchar('description', { length: 500 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index().on(t.tenantId, t.journalEntryId),
  index().on(t.tenantId, t.accountId),
]);
