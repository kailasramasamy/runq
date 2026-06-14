import { z } from 'zod';

/**
 * Dhenu milk-procurement — rate chart validators.
 * Spec: docs/dhenu-schema-spec.md §4.
 *
 * A chart is either `matrix` (FAT×SNF cells) or `flat` (single per-litre), both
 * with optional bonus/slab rules. Charts are effective-dated and immutable once
 * created — supersede by creating a new chart, not editing cells in place.
 */

const milkType = z.enum(['cow', 'buffalo', 'mixed']);

const boolFilter = z
  .union([z.boolean(), z.literal('true'), z.literal('false')])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

const cellSchema = z.object({
  fat: z.number().min(0).max(15),
  snf: z.number().min(0).max(15),
  ratePerLitre: z.number().nonnegative(),
});

const ruleSchema = z.object({
  ruleType: z.enum(['quality_bonus', 'volume_slab']),
  grade: z.enum(['a', 'b', 'c']).nullish(),
  minQty: z.number().nonnegative().nullish(),
  maxQty: z.number().nonnegative().nullish(),
  bonusPerLitre: z.number(),
});

export const createRateChartSchema = z
  .object({
    name: z.string().min(1).max(120),
    scopeNodeId: z.string().uuid().nullish(),
    milkType,
    pricingMode: z.enum(['matrix', 'flat']).default('matrix'),
    flatRatePerLitre: z.number().nonnegative().nullish(),
    season: z.string().max(20).nullish(),
    effectiveFrom: z.string().date(),
    effectiveTo: z.string().date().nullish(),
    cells: z.array(cellSchema).default([]),
    rules: z.array(ruleSchema).default([]),
  })
  .refine(
    (d) => (d.pricingMode === 'flat' ? d.flatRatePerLitre != null : d.cells.length > 0),
    { message: 'flat charts need flatRatePerLitre; matrix charts need ≥1 cell', path: ['pricingMode'] },
  );

export const rateChartFilterSchema = z.object({
  milkType: milkType.optional(),
  scopeNodeId: z.string().uuid().optional(),
  isActive: boolFilter.optional(),
});

export const resolveRateSchema = z.object({
  milkType,
  fat: z.coerce.number().min(0).max(15),
  snf: z.coerce.number().min(0).max(15),
  cycleQtyLitres: z.coerce.number().nonnegative().optional(),
  scopeNodeId: z.string().uuid().optional(),
  onDate: z.string().date().optional(),
});

export type CreateRateChartInput = z.infer<typeof createRateChartSchema>;
export type RateChartFilter = z.infer<typeof rateChartFilterSchema>;
export type ResolveRateInput = z.infer<typeof resolveRateSchema>;
