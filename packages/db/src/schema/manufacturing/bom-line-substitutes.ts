import { pgTable, uuid, integer, index, unique } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { items } from '../masters/items';
import { bomLines } from './bom-lines';

/**
 * Items a BOM line will accept in place of its own.
 *
 * Paneer takes 7 L of raw milk per kg — A2, A1 or buffalo, whichever is in the
 * tank. That is one requirement, so it stays one BOM line carrying one qty;
 * the acceptable stand-ins hang off it here with no qty of their own. A run
 * draws the line's qty FEFO across the line item and its substitutes together,
 * and consumption still posts against whichever item actually moved.
 */
export const bomLineSubstitutes = pgTable(
  'bom_line_substitutes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    bomLineId: uuid('bom_line_id')
      .notNull()
      .references(() => bomLines.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id),
    /** Tiebreak only — the draw is FEFO first, so this decides equal-expiry stock. */
    priority: integer('priority').notNull().default(0),
  },
  (t) => [
    index('idx_bom_line_subs_line').on(t.bomLineId),
    unique('uq_bom_line_subs_line_item').on(t.bomLineId, t.itemId),
  ],
);

export type BomLineSubstituteRow = typeof bomLineSubstitutes.$inferSelect;
export type NewBomLineSubstituteRow = typeof bomLineSubstitutes.$inferInsert;
