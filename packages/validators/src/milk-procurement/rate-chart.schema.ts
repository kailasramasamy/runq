import { z } from 'zod';

/**
 * Dhenu milk-procurement — rate chart validators.
 * Spec: docs/dhenu-schema-spec.md §4.
 *
 * A chart is either `matrix` (FAT×SNF cells) or `flat` (single per-litre), both
 * with optional bonus/slab rules. Charts are effective-dated and immutable once
 * created — supersede by creating a new chart, not editing cells in place.
 */

const milkType = z.enum(['cow', 'buffalo', 'mixed', 'cow_a1', 'cow_a2']);

const boolFilter = z
  .union([z.boolean(), z.literal('true'), z.literal('false')])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

// A cell is either a matrix cell (fat + snf) or a CLR cell (clr alone). Which
// one is required is enforced per pricingMode on the chart below.
const cellSchema = z.object({
  fat: z.number().min(0).max(15).nullish(),
  snf: z.number().min(0).max(15).nullish(),
  clr: z.number().min(0).max(40).nullish(),
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
    pricingMode: z.enum(['matrix', 'flat', 'clr']).default('matrix'),
    flatRatePerLitre: z.number().nonnegative().nullish(),
    season: z.string().max(20).nullish(),
    effectiveFrom: z.string().date(),
    effectiveTo: z.string().date().nullish(),
    cells: z.array(cellSchema).default([]),
    rules: z.array(ruleSchema).default([]),
  })
  .superRefine((d, ctx) => {
    if (d.pricingMode === 'flat') {
      if (d.flatRatePerLitre == null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['flatRatePerLitre'], message: 'flat charts need flatRatePerLitre' });
      }
      return;
    }
    if (d.cells.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cells'], message: `${d.pricingMode} charts need ≥1 cell` });
      return;
    }
    if (d.pricingMode === 'clr') {
      if (!d.cells.every((c) => c.clr != null)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cells'], message: 'CLR charts need a clr value on every cell' });
      }
    } else if (!d.cells.every((c) => c.fat != null && c.snf != null)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cells'], message: 'matrix charts need fat and snf on every cell' });
    }
  });

export const rateChartFilterSchema = z.object({
  milkType: milkType.optional(),
  scopeNodeId: z.string().uuid().optional(),
  isActive: boolFilter.optional(),
});

export const resolveRateSchema = z
  .object({
    milkType,
    // fat+snf for analyzer (matrix/flat) charts; clr for lactometer charts.
    fat: z.coerce.number().min(0).max(15).optional(),
    snf: z.coerce.number().min(0).max(15).optional(),
    clr: z.coerce.number().min(0).max(40).optional(),
    cycleQtyLitres: z.coerce.number().nonnegative().optional(),
    scopeNodeId: z.string().uuid().optional(),
    onDate: z.string().date().optional(),
  })
  .refine((d) => d.clr != null || (d.fat != null && d.snf != null), {
    message: 'provide clr (lactometer) or fat+snf (analyzer)',
    path: ['clr'],
  });

export type CreateRateChartInput = z.infer<typeof createRateChartSchema>;
export type RateChartFilter = z.infer<typeof rateChartFilterSchema>;
export type ResolveRateInput = z.infer<typeof resolveRateSchema>;
