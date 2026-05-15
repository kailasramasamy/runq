import {
  pgTable, uuid, varchar, integer, decimal, text, timestamp, date,
  pgEnum, index,
} from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { users } from '../user';
import { payrollRuns } from './payroll';
import { bankAccounts } from '../banking/bank-accounts';
import { journalEntries } from '../gl/journal-entries';

export const statutoryChallanKindEnum = pgEnum('statutory_challan_kind', [
  'pf', 'esi', 'pt', 'tds',
]);

export const statutoryChallanStatusEnum = pgEnum('statutory_challan_status', [
  'pending',    // liability booked on payroll approval, not yet deposited
  'deposited',  // paid to the authority; settlement JE posted, recon-eligible
]);

/**
 * One row per statutory liability paid (or to be paid) to the government —
 * PF, ESI, PT, or TDS. Unified across all four kinds; the per-kind summary
 * services build their UIs on top of this single shape.
 *
 * On `deposited`, the service posts a settlement JE:
 *   pf  → Dr 2107 PF Payable                  / Cr <bank>
 *   esi → Dr 2108 ESI Payable                 / Cr <bank>
 *   pt  → Dr 2109 Professional Tax Payable    / Cr <bank>
 *   tds → Dr 2104 TDS Payable                 / Cr <bank>
 * plus debits for any interest / late-fee captured at deposit time.
 *
 * `referenceNumber` is the kind's deposit identifier — TDS challan serial
 * (paired with `bankBsrCode` to form the CIN), PF TRRN, ESI challan number,
 * or the state PT portal reference. Form 24Q reads BSR + serial off TDS
 * rows here.
 */
export const statutoryChallans = pgTable('statutory_challans', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),

  kind: statutoryChallanKindEnum('kind').notNull(),
  payrollRunId: uuid('payroll_run_id').references(() => payrollRuns.id, { onDelete: 'set null' }),
  periodMonth: integer('period_month').notNull(),
  periodYear: integer('period_year').notNull(),
  /** PT only: GST state code that drove the slab. */
  stateCode: varchar('state_code', { length: 2 }),
  /** TDS only: income-tax section (192 for salary). */
  section: varchar('section', { length: 10 }),

  liabilityAmount: decimal('liability_amount', { precision: 15, scale: 2 }).notNull().default('0'),
  interestAmount: decimal('interest_amount', { precision: 15, scale: 2 }).notNull().default('0'),
  lateFeeAmount: decimal('late_fee_amount', { precision: 15, scale: 2 }).notNull().default('0'),
  /** Total actually deposited = liability + interest + late fee. */
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull().default('0'),

  status: statutoryChallanStatusEnum('status').notNull().default('pending'),

  /** TDS only: 7-digit bank branch BSR code (paired with referenceNumber = CIN). */
  bankBsrCode: varchar('bank_bsr_code', { length: 7 }),
  /** TDS challan serial / PF TRRN / ESI challan no / PT portal reference. */
  referenceNumber: varchar('reference_number', { length: 30 }),
  depositDate: date('deposit_date'),
  paymentMode: varchar('payment_mode', { length: 30 }),
  bankRef: varchar('bank_ref', { length: 50 }),
  bankAccountId: uuid('bank_account_id').references(() => bankAccounts.id),

  journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id),
  notes: text('notes'),
  depositedBy: uuid('deposited_by').references(() => users.id),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_sc_tenant_status').on(t.tenantId, t.status),
  index('idx_sc_tenant_kind').on(t.tenantId, t.kind),
  index('idx_sc_tenant_run').on(t.tenantId, t.payrollRunId),
]);
