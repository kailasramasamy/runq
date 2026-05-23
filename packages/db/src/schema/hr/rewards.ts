import {
  pgTable, uuid, varchar, decimal, date, text, boolean, integer,
  timestamp, pgEnum, index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { users } from '../user';
import { employees } from './employees';
import { journalEntries } from '../gl/journal-entries';

/**
 * Rewards & spot bonuses — recognition a manager initiates for one of their
 * reports, HR approves, and (when monetary) syncs to Finance.
 *
 * A monetary reward walks draft → submitted → approved → posted → paid:
 * `posted` books the expense JE (Dr <type account> / Cr 2114 Employee Rewards
 * Payable) and `paid` settles it through the `employee_payments` subledger
 * (Dr 2114 / Cr bank), exactly like an expense claim. A `recognition` reward
 * carries no money — it is terminal at `approved`, never touching the GL.
 */
/**
 * `points` is the third kind: a manager grants points the employee
 * accumulates and can redeem later for cash (1 pt = ₹1). A *redemption* is
 * stored as a `monetary` reward with `pointsUsed` set, initiated by the
 * employee themselves and settled through the normal monetary payout.
 */
export const rewardKindEnum = pgEnum('reward_kind', ['monetary', 'recognition', 'points']);

export const rewardStatusEnum = pgEnum('reward_status', [
  'draft',      // manager is still drafting
  'submitted',  // sent to HR for approval
  'approved',   // HR approved — terminal for recognition rewards
  'rejected',   // HR rejected — terminal
  'posted',     // monetary: expense JE booked, awaiting payout
  'paid',       // monetary: disbursed via employee_payments
]);

/** HR-configured catalogue of reward types (Spot Bonus, Referral, …). */
export const rewardTypes = pgTable('reward_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  name: varchar('name', { length: 60 }).notNull(),
  code: varchar('code', { length: 20 }).notNull(),
  kind: rewardKindEnum('kind').notNull().default('monetary'),
  /** Expense account a monetary reward of this type debits. Unused for recognition. */
  glAccountCode: varchar('gl_account_code', { length: 20 }).notNull().default('5205'),
  displayOrder: integer('display_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_rt_tenant').on(t.tenantId),
  uniqueIndex('uq_rt_tenant_code').on(t.tenantId, t.code),
]);

export const employeeRewards = pgTable('employee_rewards', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  rewardNumber: varchar('reward_number', { length: 50 }).notNull(),
  /** Recipient — the subject of the reward; HR scope checks key off this. */
  employeeId: uuid('employee_id').notNull().references(() => employees.id),
  rewardTypeId: uuid('reward_type_id').notNull().references(() => rewardTypes.id),
  /** Snapshot of the type's kind at creation — later type edits never rewrite history. */
  kind: rewardKindEnum('kind').notNull().default('monetary'),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull().default('0'),
  title: varchar('title', { length: 120 }).notNull(),
  citation: text('citation'),
  awardDate: date('award_date').notNull(),
  status: rewardStatusEnum('status').notNull().default('draft'),
  /** Manager who initiated the reward. */
  initiatedBy: uuid('initiated_by').notNull().references(() => users.id),
  approvedBy: uuid('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  rejectionReason: text('rejection_reason'),
  /** Expense account snapshot used by the GL post (monetary only). */
  glAccountCode: varchar('gl_account_code', { length: 20 }),
  /** Expense JE booked on post: Dr <glAccountCode> / Cr 2114 Employee Rewards Payable. */
  journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id),
  /** Set only on a redemption row — number of points this monetary reward
   *  consumed. Subtracted from the employee's balance for any redemption
   *  whose status is not 'rejected'. */
  pointsUsed: integer('points_used'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_er_tenant_status').on(t.tenantId, t.status),
  index('idx_er_tenant_employee').on(t.tenantId, t.employeeId),
  uniqueIndex('uq_er_tenant_number').on(t.tenantId, t.rewardNumber),
]);
