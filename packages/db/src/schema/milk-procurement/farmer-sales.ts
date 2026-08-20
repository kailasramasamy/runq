import {
  pgTable, uuid, varchar, decimal, date, timestamp, index,
} from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { users } from '../user';
import { items } from '../masters/items';
import { journalEntries } from '../gl/journal-entries';
import { mpFarmers } from './farmers';
import { mpNodes } from './nodes';
import { mpFarmerLedger } from './payouts';
import { mpShift, mpMilkType, mpSaleKind } from './enums';

/**
 * Goods sold TO a farmer — the trader who supplies us and also buys from us.
 * Two kinds, deliberately in one table because they settle identically:
 *
 *   • `raw_milk` — bulk milk off the centre's own pool. Carries `milk_type`
 *     and (at a per-shift centre) a shift, and its litres count as an OUTFLOW
 *     at the node, so collected-vs-dispatched still reconciles.
 *   • `product`  — ghee, curd, paneer… an `items` row. Money only for now:
 *     no stock issue, no COGS (Dhenu has no per-centre warehouse), so the
 *     ledger and the payout statement are the whole story.
 *
 * Either way `ledger_entry_id` points at the `farmer_sale` debit on
 * mp_farmer_ledger, which the next payout cycle recovers ahead of advances.
 *
 * Append-only in spirit: a correction sets `reversed_at` (posting the contra
 * ledger entry + JE) rather than mutating the row.
 */
export const mpFarmerSales = pgTable('mp_farmer_sales', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  farmerId: uuid('farmer_id').notNull().references(() => mpFarmers.id),
  // Where the goods were handed over. For raw milk this is the pool the litres
  // are drawn from; for a product it records who sold it.
  nodeId: uuid('node_id').notNull().references(() => mpNodes.id),
  saleDate: date('sale_date').notNull(),
  kind: mpSaleKind('kind').notNull().default('raw_milk'),
  // Raw milk only. Null on a product line.
  shift: mpShift('shift'),
  milkType: mpMilkType('milk_type'),
  // Product only. Null on a raw-milk line.
  itemId: uuid('item_id').references(() => items.id),
  qty: decimal('qty', { precision: 12, scale: 3 }).notNull(),
  // Snapshot of the unit sold ('L' for milk, else the item's) so an old row
  // still reads correctly after the item master is edited.
  unit: varchar('unit', { length: 20 }).notNull().default('L'),
  ratePerUnit: decimal('rate_per_unit', { precision: 12, scale: 2 }).notNull(),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  note: varchar('note', { length: 255 }),
  ledgerEntryId: uuid('ledger_entry_id').references(() => mpFarmerLedger.id),
  journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id),
  reversedAt: timestamp('reversed_at', { withTimezone: true }),
  reversedBy: uuid('reversed_by').references(() => users.id),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // Availability + pending-dispatch difference the live raw-milk rows per
  // (node, date), so that lookup is the one that has to be cheap.
  index('idx_mp_farmer_sales_node_date').on(t.tenantId, t.nodeId, t.saleDate),
  index('idx_mp_farmer_sales_farmer').on(t.tenantId, t.farmerId, t.saleDate),
]);

export type MpFarmerSaleRow = typeof mpFarmerSales.$inferSelect;
export type NewMpFarmerSaleRow = typeof mpFarmerSales.$inferInsert;
