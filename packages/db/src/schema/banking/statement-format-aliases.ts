import { pgTable, uuid, varchar, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';

/**
 * Stores learned column mappings for bank statement formats.
 * When the AI parser successfully parses a statement, we save the
 * header signature → column index mapping so future imports from
 * the same bank use local intelligence instead of AI.
 *
 * The header_signature is a normalized, lowercased, comma-joined
 * version of the first header row (e.g. "date,narration,chq no,debit,credit,balance").
 * The column_mapping is a JSON object like:
 *   { "date": 0, "narration": 1, "reference": 2, "debit": 3, "credit": 4, "balance": 5 }
 */
export const bankStatementFormatAliases = pgTable('bank_statement_format_aliases', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  bankNamePattern: varchar('bank_name_pattern', { length: 255 }).notNull(),
  headerSignature: varchar('header_signature', { length: 1000 }).notNull(),
  columnMapping: jsonb('column_mapping').notNull().$type<Record<string, number>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_bsfa_tenant_header').on(t.tenantId, t.headerSignature),
]);
