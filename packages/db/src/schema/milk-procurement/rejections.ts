import {
  pgTable, uuid, varchar, decimal, date, timestamp, index,
} from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { users } from '../user';
import { journalEntries } from '../gl/journal-entries';
import { mpFarmers } from './farmers';
import { mpNodes } from './nodes';
import { mpFarmerLedger } from './payouts';
import {
  mpShift, mpMilkType, mpRejectionStage, mpRejectionReason,
  mpRejectionDisposition, mpRejectionBearer,
} from './enums';

/**
 * Milk refused for quality, at any of the three points it can be caught: the
 * VMCC gate, the CC's receipt, the plant's.
 *
 * The pour or receipt it came from STAYS on record, with its reading. This is
 * the whole point of the table — reversing the pour withholds the money but
 * destroys the evidence, so a farmer whose milk is refused weekly looks
 * identical to one whose never is. A rejection instead adds a deduction that
 * nets the payment off, leaving the litres, the QC and the refusal all visible.
 *
 * Partial is the normal case: a farmer brings 20 L and 8 L is refused.
 */
export const mpRejections = pgTable('mp_rejections', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  stage: mpRejectionStage('stage').notNull(),
  // Polymorphic over the same two subjects as `mp_qc_tests`, so the reading
  // that justified the refusal and the refusal itself hang off one id.
  subjectType: varchar('subject_type', { length: 20 }).notNull(), // 'pour' | 'consignment'
  subjectId: uuid('subject_id'),
  // Where the call was made.
  nodeId: uuid('node_id').notNull().references(() => mpNodes.id),
  // Who sent it. Null at the gate, where the source is a farmer, not a node.
  fromNodeId: uuid('from_node_id').references(() => mpNodes.id),
  collectionDate: date('collection_date').notNull(),
  shift: mpShift('shift'),
  milkType: mpMilkType('milk_type'),
  qtyLitres: decimal('qty_litres', { precision: 12, scale: 3 }).notNull(),
  reason: mpRejectionReason('reason').notNull(),
  notes: varchar('notes', { length: 500 }),
  disposition: mpRejectionDisposition('disposition').notNull().default('returned'),
  // Resolved from what the milk traces back to, then stored — so the decision
  // is auditable rather than re-derived years later from rules nobody recalls.
  borneBy: mpRejectionBearer('borne_by').notNull(),
  // Set only for the `company` override, which is the one bearer that posts its
  // own journal rather than settling through a cycle or a bill.
  journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id),
  rejectedAt: timestamp('rejected_at', { withTimezone: true }).notNull().defaultNow(),
  rejectedBy: uuid('rejected_by').references(() => users.id),
  // A rejection is a judgement call, and judgement calls are got wrong.
  // Reversed, never deleted — the same treatment pours and consignments get.
  reversedAt: timestamp('reversed_at', { withTimezone: true }),
  reversedBy: uuid('reversed_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_mp_rejections_node_date').on(t.tenantId, t.nodeId, t.collectionDate),
  index('idx_mp_rejections_from_date').on(t.tenantId, t.fromNodeId, t.collectionDate),
  index('idx_mp_rejections_subject').on(t.tenantId, t.subjectType, t.subjectId),
]);

/**
 * What one rejection costs, and to whom.
 *
 * Its own table because a rejected can can trace back to several farmers' pours
 * and has to split across them by volume — one charge each, at each pour's own
 * rate, so what is withheld matches what would have been paid.
 */
export const mpRejectionCharges = pgTable('mp_rejection_charges', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  rejectionId: uuid('rejection_id').notNull().references(() => mpRejections.id),
  // Exactly one of these is set — enforced by a CHECK in the migration.
  farmerId: uuid('farmer_id').references(() => mpFarmers.id),
  vmccNodeId: uuid('vmcc_node_id').references(() => mpNodes.id),
  // The pour this share traces to, when it traces to one. Carries the rate.
  pourId: uuid('pour_id'),
  qtyLitres: decimal('qty_litres', { precision: 12, scale: 3 }).notNull(),
  ratePerLitre: decimal('rate_per_litre', { precision: 8, scale: 2 }).notNull(),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  /**
   * Farmer charges only, and the whole of how they settle: a `quality_rejection`
   * debit on the farmer's running ledger, which the payout waterfall already
   * knows how to recover. Same rail `mp_farmer_sales` rides.
   *
   * A VMCC charge has no equivalent, and needs none. Its milk is priced for
   * billing straight off `mp_consignments.receipt_qty` (ReportService
   * .pricedDrGross), and a rejection is received NET — so the litres never
   * reach the bill in the first place. This row records what it cost them, for
   * the rejection reports; nothing has to go and deduct it.
   */
  ledgerEntryId: uuid('ledger_entry_id').references(() => mpFarmerLedger.id),
  reversedAt: timestamp('reversed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_mp_rej_charges_rejection').on(t.tenantId, t.rejectionId),
  index('idx_mp_rej_charges_farmer').on(t.tenantId, t.farmerId),
  index('idx_mp_rej_charges_vmcc').on(t.tenantId, t.vmccNodeId),
]);

export type MpRejectionRow = typeof mpRejections.$inferSelect;
export type NewMpRejectionRow = typeof mpRejections.$inferInsert;
export type MpRejectionChargeRow = typeof mpRejectionCharges.$inferSelect;
export type NewMpRejectionChargeRow = typeof mpRejectionCharges.$inferInsert;
