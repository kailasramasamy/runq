import { z } from 'zod';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

export const stockSummaryFilterSchema = z.object({
  warehouseId: z.string().uuid().optional(),
  category: z.string().max(60).optional(),
});

export const valuationFilterSchema = z.object({
  // as-of-date; default = today. Computed as the running_value at the
  // latest ledger row at or before this date, per (item, warehouse, batch).
  asOf: dateString.optional(),
  warehouseId: z.string().uuid().optional(),
});

export const ageingFilterSchema = z.object({
  warehouseId: z.string().uuid().optional(),
  // Buckets are fixed: 0-30, 31-60, 61-90, 91-180, 180+.
});

export const movementSummaryFilterSchema = z.object({
  from: dateString.optional(),
  to: dateString.optional(),
  warehouseId: z.string().uuid().optional(),
  // groupBy: day | week | month. v1 ships day; everything else aggregates client-side.
  groupBy: z.enum(['day', 'week', 'month']).default('day'),
});

export const deadStockFilterSchema = z.object({
  warehouseId: z.string().uuid().optional(),
  // No movement for at least this many days. Default 90.
  daysSinceMovement: z.coerce.number().int().positive().max(3650).default(90),
});

export const serialLookupFilterSchema = z.object({
  itemId: z.string().uuid().optional(),
  status: z.enum(['in_stock', 'sold', 'returned', 'scrapped', 'in_transit']).optional(),
  warehouseId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(500).default(50),
});

export type StockSummaryFilter = z.infer<typeof stockSummaryFilterSchema>;
export type ValuationFilter = z.infer<typeof valuationFilterSchema>;
export type AgeingFilter = z.infer<typeof ageingFilterSchema>;
export type MovementSummaryFilter = z.infer<typeof movementSummaryFilterSchema>;
export type DeadStockFilter = z.infer<typeof deadStockFilterSchema>;
export type SerialLookupFilter = z.infer<typeof serialLookupFilterSchema>;
