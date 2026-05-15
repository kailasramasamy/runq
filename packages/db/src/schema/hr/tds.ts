import {
  pgTable, uuid, varchar, integer, text, timestamp,
  pgEnum, jsonb, index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { users } from '../user';

// ── Enums ──────────────────────────────────────────────────────────────

export const tdsReturnStatusEnum = pgEnum('tds_return_status', [
  'draft',      // generated from payslips + challans, not yet checked
  'validated',  // pre-flight checks passed
  'generated',  // RPU-importable file produced
  'filed',      // filed on TRACES, token/RRR received
  'error',      // generation or filing failed
]);

// ── Form 24Q payload types ─────────────────────────────────────────────

/** Annexure I — deductee-wise deduction detail, linked to a challan CIN.
 *  Filed every quarter. */
export type Form24QAnnexureIRow = {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  pan: string | null;
  /** CIN of the challan this deduction is paid under. */
  challanBsrCode: string | null;
  challanSerialNo: string | null;
  challanDepositDate: string | null;
  paymentMonth: number;       // 1-12, the payroll month
  amountPaid: number;         // gross salary paid that month
  tdsDeducted: number;
};

/** Annexure II — annual salary detail + tax computation per employee.
 *  Filed only in Q4. New regime, no declarations (matches the calculator). */
export type Form24QAnnexureIIRow = {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  pan: string | null;
  grossSalary: number;
  standardDeduction: number;
  taxableIncome: number;
  taxOnIncome: number;        // incl. 87A rebate + 4% cess
  tdsDeducted: number;        // total across the FY
  monthsPaid: number;
};

export type Form24QData = {
  annexureI: Form24QAnnexureIRow[];
  annexureII?: Form24QAnnexureIIRow[];   // Q4 only
};

// ── Tables ─────────────────────────────────────────────────────────────

// Monthly TDS deposit challans now live in the unified `statutory_challans`
// table (see ./statutory-challans.ts). Filter by `kind = 'tds'`.

/**
 * Quarterly Form 24Q return — mirrors gst_returns. `data` snapshots the full
 * Annexure I/II payload at generation time; the lifecycle ends at `filed`
 * once the customer uploads the RPU file and records the token/RRR.
 */
export const tdsReturns = pgTable('tds_returns', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  tan: varchar('tan', { length: 10 }).notNull(),
  returnType: varchar('return_type', { length: 10 }).notNull().default('24q'),
  financialYear: varchar('financial_year', { length: 7 }).notNull(), // '2026-27'
  quarter: integer('quarter').notNull(),                              // 1-4

  status: tdsReturnStatusEnum('status').notNull().default('draft'),
  data: jsonb('data').$type<Form24QData>(),
  errorDetails: jsonb('error_details').$type<Array<{ code: string; message: string }>>(),

  token: varchar('token', { length: 50 }),  // provisional receipt / RRR after filing
  filedAt: timestamp('filed_at', { withTimezone: true }),
  filedBy: uuid('filed_by').references(() => users.id),

  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_tds_return_tenant_status').on(t.tenantId, t.status),
  uniqueIndex('uq_tds_return_period').on(t.tenantId, t.returnType, t.financialYear, t.quarter),
]);
