import { z } from 'zod';
import { queryBool } from '../common/query-bool.schema';
import { itemClassValues, type ItemClass } from '../masters/item.schema';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

/**
 * Operational grouping of item_class for inventory screens. Collapses the
 * 7 classes into 4 buckets that match how factory floors actually segregate
 * stock — Finished (made/sold), Inputs (received from suppliers), Trading
 * (bought-to-resell), and Other (consumables / spares). 'all' is the
 * no-filter pass-through used when the user explicitly wants everything.
 */
export const itemClassGroupValues = ['finished', 'inputs', 'trading', 'other', 'all'] as const;
export const itemClassGroupSchema = z.enum(itemClassGroupValues);
export type ItemClassGroup = z.infer<typeof itemClassGroupSchema>;

/** Resolves a group to the concrete item_class enum values it contains. */
export const ITEM_CLASS_GROUP_MEMBERS: Record<ItemClassGroup, readonly ItemClass[]> = {
  finished: ['finished_good', 'semi_finished'],
  inputs:   ['raw_material', 'packaging'],
  trading:  ['trading_good'],
  other:    ['consumable', 'spare_part'],
  all:      itemClassValues,
};

export const stockOnHandFilterSchema = z.object({
  warehouseId: z.string().uuid().optional(),
  itemId: z.string().uuid().optional(),
  category: z.string().max(60).optional(),
  /** New axis-1 segregation. Server resolves the group to the matching set
   *  of item_class values before filtering. */
  itemClassGroup: itemClassGroupSchema.optional(),
  lowOnly: queryBool.optional(),
  expiringInDays: z.coerce.number().int().positive().max(365).optional(),
});

export const stockLedgerFilterSchema = z.object({
  itemId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
  movementType: z
    .enum([
      'grn', 'delivery', 'transfer_in', 'transfer_out',
      'adjustment_in', 'adjustment_out', 'opening', 'reversal',
      'stock_take_in', 'stock_take_out',
    ])
    .optional(),
  from: dateString.optional(),
  to: dateString.optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(500).default(100),
});

export type StockOnHandFilter = z.infer<typeof stockOnHandFilterSchema>;
export type StockLedgerFilter = z.infer<typeof stockLedgerFilterSchema>;

// Extension to item input — added on top of the existing items master schema.
// Lives here (not masters/) so inventory remains self-contained.
export const inventoryItemTrackingSchema = z.object({
  trackInventory: z.boolean().optional(),
  trackBatches: z.boolean().optional(),
  trackSerials: z.boolean().optional(),
  trackExpiry: z.boolean().optional(),
  allowNegativeStock: z.boolean().optional(),
  reorderLevel: z.number().nonnegative().nullish(),
  reorderQty: z.number().nonnegative().nullish(),
  defaultWarehouseId: z.string().uuid().nullish(),
  barcode: z.string().max(64).nullish(),
  weightKg: z.number().nonnegative().nullish(),
  shelfLifeDays: z.number().int().nonnegative().nullish(),
});

export type InventoryItemTrackingInput = z.infer<typeof inventoryItemTrackingSchema>;
