import {
  pgTable, uuid, varchar, decimal, date, text, timestamp,
  pgEnum, index, uniqueIndex, check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from '../tenant';
import { users } from '../user';

// Labour contracts — how work is actually engaged, in three shapes:
//
//   solo_daily    one worker on a daily rate
//   task_lumpsum  an agreed price for a job ("₹15,000 to lay the plant
//                 flooring"). We deal with the crew lead and do not care
//                 how many people he brings.
//   crew_daily    a named crew, each on their own rate (mason ₹1,200,
//                 assistant ₹800, helper ₹500)
//
// Solo is modelled as a crew of one. Rates therefore live on
// `contractMembers` and never on the contract, which collapses the
// calendar, the earnings maths and the settlement into one code path.
//
// None of this touches `employees`: most of these workers are never on the
// rolls. A contract carries its own name and a lead person.

export const contractTypeEnum = pgEnum('contract_type', [
  'solo_daily',
  'task_lumpsum',
  'crew_daily',
]);

export const contractStatusEnum = pgEnum('contract_status', [
  'active',
  'completed',
  'cancelled',
]);

export const contractDayStatusEnum = pgEnum('contract_day_status', [
  'worked',
  'leave',
  'half_day',
]);

export const advanceStatusEnum = pgEnum('advance_status', [
  'paid',
  'recovered',
  'cancelled',
]);

export const contractSettlementStatusEnum = pgEnum('contract_settlement_status', [
  'draft',
  'approved',
  'paid',
  'cancelled',
]);

export const labourContracts = pgTable('labour_contracts', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  contractNumber: varchar('contract_number', { length: 30 }).notNull(),
  /** What the job is — "Warehouse flooring" — not a person's name. */
  name: varchar('name', { length: 200 }).notNull(),
  leadPersonName: varchar('lead_person_name', { length: 150 }).notNull(),
  leadPersonPhone: varchar('lead_person_phone', { length: 20 }),
  contractType: contractTypeEnum('contract_type').notNull(),
  /** task_lumpsum only; day-rate contracts price through their members. */
  fixedAmount: decimal('fixed_amount', { precision: 15, scale: 2 }),
  startDate: date('start_date').notNull(),
  /**
   * Null = open-ended: the work runs until it is done. Earnings accrue to
   * today, and settling stamps the through-date here.
   */
  endDate: date('end_date'),
  status: contractStatusEnum('status').notNull().default('active'),
  notes: text('notes'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_labour_contract_tenant_status').on(t.tenantId, t.status),
  uniqueIndex('uq_labour_contract_number').on(t.tenantId, t.contractNumber),
  check(
    'ck_labour_contract_dates',
    sql`${t.endDate} IS NULL OR ${t.endDate} >= ${t.startDate}`,
  ),
  check(
    'ck_labour_contract_amount',
    sql`(${t.contractType} = 'task_lumpsum' AND ${t.fixedAmount} IS NOT NULL)
     OR (${t.contractType} <> 'task_lumpsum' AND ${t.fixedAmount} IS NULL)`,
  ),
]);

/**
 * One row per person on a day-rate contract. A solo_daily contract has
 * exactly one; a task_lumpsum has none.
 */
export const contractMembers = pgTable('contract_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  contractId: uuid('contract_id').notNull()
    .references(() => labourContracts.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 150 }).notNull(),
  /** Free text: mason, assistant, helper. Trades vary too much for an enum. */
  role: varchar('role', { length: 80 }),
  dailyRate: decimal('daily_rate', { precision: 10, scale: 2 }).notNull(),
  /** Members join and leave mid-term; earnings accrue only inside this window. */
  joinedOn: date('joined_on'),
  leftOn: date('left_on'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_contract_member_contract').on(t.contractId),
  check('ck_contract_member_rate', sql`${t.dailyRate} > 0`),
  check(
    'ck_contract_member_dates',
    sql`${t.leftOn} IS NULL OR ${t.joinedOn} IS NULL OR ${t.leftOn} >= ${t.joinedOn}`,
  ),
]);

/**
 * EXCEPTIONS ONLY.
 *
 * Every day from the start date counts as worked. Writing a row per worked
 * day would need a scheduler to keep an open-ended contract current and
 * would grow without bound; storing only the days that deviate keeps the
 * calendar correct with no background job at all.
 */
export const contractDayLog = pgTable('contract_day_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  contractId: uuid('contract_id').notNull()
    .references(() => labourContracts.id, { onDelete: 'cascade' }),
  memberId: uuid('member_id').notNull()
    .references(() => contractMembers.id, { onDelete: 'cascade' }),
  logDate: date('log_date').notNull(),
  status: contractDayStatusEnum('status').notNull(),
  note: text('note'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('uq_contract_day').on(t.memberId, t.logDate),
  index('idx_contract_day_contract').on(t.contractId, t.logDate),
]);

/**
 * Advances. `memberId` is null on a task_lumpsum contract, where the money
 * goes to the crew lead and there are no members to attribute it to.
 *
 * An advance is an ASSET while outstanding (Dr 1122) — money owed back. The
 * wage hits P&L once, at settlement.
 */
export const contractAdvances = pgTable('contract_advances', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  contractId: uuid('contract_id').notNull().references(() => labourContracts.id),
  memberId: uuid('member_id').references(() => contractMembers.id),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  paidOn: date('paid_on').notNull(),
  paymentMethod: varchar('payment_method', { length: 30 }).notNull().default('cash'),
  bankAccountId: uuid('bank_account_id'),
  reference: varchar('reference', { length: 100 }),
  notes: text('notes'),
  status: advanceStatusEnum('status').notNull().default('paid'),
  settlementId: uuid('settlement_id'),
  journalEntryId: uuid('journal_entry_id'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_contract_advance_contract').on(t.contractId),
  index('idx_contract_advance_member').on(t.memberId),
  check('ck_contract_advance_amount', sql`${t.amount} > 0`),
]);

export const labourSettlements = pgTable('labour_settlements', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  contractId: uuid('contract_id').notNull().references(() => labourContracts.id),
  settlementNumber: varchar('settlement_number', { length: 30 }).notNull(),
  fromDate: date('from_date').notNull(),
  /**
   * The through-date the settlement was computed to. On an open-ended
   * contract this is what gets stamped onto `endDate` at approval.
   */
  toDate: date('to_date').notNull(),
  earned: decimal('earned', { precision: 15, scale: 2 }).notNull().default('0'),
  advancesRecovered: decimal('advances_recovered', { precision: 15, scale: 2 }).notNull().default('0'),
  otherDeductions: decimal('other_deductions', { precision: 15, scale: 2 }).notNull().default('0'),
  netPayable: decimal('net_payable', { precision: 15, scale: 2 }).notNull().default('0'),
  status: contractSettlementStatusEnum('status').notNull().default('draft'),
  notes: text('notes'),
  journalEntryId: uuid('journal_entry_id'),
  approvedBy: uuid('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_labour_settlement_tenant_status').on(t.tenantId, t.status),
  uniqueIndex('uq_labour_settlement_number').on(t.tenantId, t.settlementNumber),
  check('ck_labour_settlement_dates', sql`${t.toDate} >= ${t.fromDate}`),
]);

/**
 * Per-member breakdown. A crew is settled person by person — the mason and
 * the helper are paid separately — so header totals alone would not tell
 * anyone what to hand over.
 *
 * `memberName`, `memberRole` and `dailyRate` are denormalised deliberately:
 * a settlement records what was agreed and paid at that moment, and editing
 * a member afterwards must not rewrite history.
 */
export const labourSettlementLines = pgTable('labour_settlement_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  settlementId: uuid('settlement_id').notNull()
    .references(() => labourSettlements.id, { onDelete: 'cascade' }),
  memberId: uuid('member_id').references(() => contractMembers.id),
  memberName: varchar('member_name', { length: 150 }).notNull(),
  memberRole: varchar('member_role', { length: 80 }),
  daysWorked: decimal('days_worked', { precision: 6, scale: 1 }).notNull().default('0'),
  dailyRate: decimal('daily_rate', { precision: 10, scale: 2 }),
  earned: decimal('earned', { precision: 15, scale: 2 }).notNull().default('0'),
  advancesRecovered: decimal('advances_recovered', { precision: 15, scale: 2 }).notNull().default('0'),
  netPayable: decimal('net_payable', { precision: 15, scale: 2 }).notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_labour_settlement_line_settlement').on(t.settlementId),
]);
