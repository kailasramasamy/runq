import { pgTable, uuid, varchar, timestamp, index, boolean } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { accounts } from '../gl/accounts';
import { vendors } from '../ap/vendors';
import { customers } from '../ar/customers';

/**
 * Learned narration → GL account mappings per tenant.
 *
 * When a user manually categorizes a bank transaction, we extract a
 * normalized narration pattern and save it here. On future imports,
 * the categorize service checks these rules BEFORE hardcoded rules
 * or AI, so the system gets smarter with every manual action.
 *
 * Pattern matching is case-insensitive substring match on the
 * normalized narration. The pattern is typically the payee name
 * extracted from NEFT/IMPS narrations (e.g., "INDUSPPBENCHKAL",
 * "RAZORPAY PAYMENTS").
 */
export const bankNarrationRules = pgTable('bank_narration_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  /** Normalized pattern to match against narration (case-insensitive substring). */
  pattern: varchar('pattern', { length: 500 }).notNull(),
  /** GL account to assign when pattern matches. */
  glAccountId: uuid('gl_account_id').notNull().references(() => accounts.id),
  /** Vendor to auto-bill when pattern matches (nullable — GL-only rules omit this). */
  vendorId: uuid('vendor_id').references(() => vendors.id),
  /** Customer to tag on credit transactions (nullable). */
  customerId: uuid('customer_id').references(() => customers.id),
  /** When true, matching transactions are also marked as reconciled. */
  autoReconcile: boolean('auto_reconcile').notNull().default(true),
  /** Transaction type this rule applies to. Null = both. */
  txnType: varchar('txn_type', { length: 10 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_bnr_tenant').on(t.tenantId),
]);
