/**
 * Maps an items master `item_class` to the chart-of-accounts code that
 * should be debited when that item is received into stock. Used by the
 * AP Pattern-B bill-post flow when the bill has a linked inventory GRN
 * — see `docs/ap-pattern-b-spec.md` §4.
 *
 * Account codes 1111/1112/1113 ship with the standard COA seed; the
 * remaining four (1118–1121) are added per tenant by migration `0115`.
 *
 * If a tenant has not been re-seeded (account row missing) the GL poster
 * falls back to `DEFAULT_INVENTORY_ACCOUNT_CODE` so the bill still posts;
 * an admin can fix the COA later without re-running the bill.
 */

import { itemClassEnum } from '@runq/db';

type ItemClass = (typeof itemClassEnum.enumValues)[number];

export type InventoryAccountCode =
  | '1111' | '1112' | '1113' | '1118' | '1119' | '1120' | '1121';

export const INVENTORY_ACCOUNT_BY_CLASS: Record<ItemClass, InventoryAccountCode> = {
  raw_material:   '1111',
  finished_good:  '1112',
  packaging:      '1113',
  semi_finished:  '1118',
  trading_good:   '1119',
  consumable:     '1120',
  spare_part:     '1121',
};

/**
 * Catch-all for items with NULL `itemClass` (services), or when the
 * mapped account is missing in a tenant's COA. Raw Materials is the
 * safest default — it's the most-used inventory bucket for the dairy
 * pilot tenant and exists in every standard COA.
 */
export const DEFAULT_INVENTORY_ACCOUNT_CODE: InventoryAccountCode = '1111';

/**
 * Existing default for service / non-stocked bill lines. Mirrors the
 * legacy `gl.postPurchaseInvoice` fallback so non-Pattern-B bills behave
 * exactly as before.
 */
export const DEFAULT_EXPENSE_ACCOUNT_CODE = '5002';

export function inventoryAccountFor(itemClass: ItemClass | null | undefined): InventoryAccountCode {
  if (!itemClass) return DEFAULT_INVENTORY_ACCOUNT_CODE;
  return INVENTORY_ACCOUNT_BY_CLASS[itemClass] ?? DEFAULT_INVENTORY_ACCOUNT_CODE;
}
