import { pgTable, uuid, timestamp, unique } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { users } from '../user';
import { accounts } from './accounts';
import { journalEntries } from './journal-entries';

/**
 * Internal P&L marks: an expense line the owner counts as profit taken out
 * (booked as an expense for the official books). Read only by the monthly
 * P&L; the GL is untouched. Cascades away when its entry is re-posted.
 */
export const pnlProfitMarks = pgTable('pnl_profit_marks', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  journalEntryId: uuid('journal_entry_id').notNull().references(() => journalEntries.id, { onDelete: 'cascade' }),
  accountId: uuid('account_id').notNull().references(() => accounts.id),
  markedBy: uuid('marked_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique().on(t.tenantId, t.journalEntryId, t.accountId),
]);
