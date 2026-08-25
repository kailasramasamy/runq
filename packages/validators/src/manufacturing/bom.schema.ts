import { z } from 'zod';

/**
 * Manufacturing Phase 1 — BOM validators.
 * Spec: docs/manufacturing-plan.md §5.1 + §4.1–4.2.
 *
 * A BOM is a recipe: one output item + qty + UOM, plus N input lines.
 * Editing a BOM that has WOs referencing it auto-creates a new version row;
 * the service layer handles the version bump, not these schemas.
 */

const bomLineSchema = z.object({
  inputItemId: z.string().uuid(),
  qtyPerOutput: z.number().positive('Qty per output must be positive'),
  inputUom: z.string().min(1).max(20),
  scrapPct: z.number().min(0).max(99.99).default(0),
  /**
   * Items accepted in place of this line's own — "7 L of raw milk, A2 or A1 or
   * buffalo". The qty above covers them all; substitutes carry none of their
   * own, so a recipe never reads as 7 + 7 + 7.
   */
  substitutes: z.array(z.string().uuid()).max(10).default([]),
  isOptional: z.boolean().default(false),
  notes: z.string().nullish(),
});

const bomBaseSchema = z.object({
  bomCode: z
    .string()
    .min(1, 'BOM code required')
    .max(50)
    .regex(/^[A-Z0-9._-]+$/i, 'BOM code: letters, digits, . _ - only'),
  name: z.string().min(1).max(200),
  outputItemId: z.string().uuid(),
  outputQty: z.number().positive('Output qty must be positive'),
  outputUom: z.string().min(1).max(20),
  /**
   * Output is branded at dispatch, not at production — a short DN line
   * backflushes this recipe instead of failing. See migration 0186.
   */
  allowAutoRepack: z.boolean().default(false),
  effectiveFrom: z.string().date().nullish(),
  notes: z.string().nullish(),
  lines: z.array(bomLineSchema).min(1, 'At least one input line required'),
});

export const createBomSchema = bomBaseSchema.superRefine(checkSubstitutes);

/**
 * A line cannot stand in for itself, and cannot name the same stand-in twice —
 * either would queue one batch of stock as two and let the run draw more milk
 * than the tank holds.
 */
function checkSubstitutes(
  value: { lines?: Array<{ inputItemId?: string; substitutes?: string[] }> },
  ctx: z.RefinementCtx,
) {
  (value.lines ?? []).forEach((line, i) => {
    const subs = line.substitutes ?? [];
    if (subs.length === 0) return;

    const message = subs.includes(line.inputItemId ?? '')
      ? 'A line cannot list its own item as a substitute'
      : new Set(subs).size !== subs.length
        ? 'The same substitute is listed twice'
        : null;
    if (message) ctx.addIssue({ code: 'custom', path: ['lines', i, 'substitutes'], message });
  });
}

export const updateBomSchema = bomBaseSchema
  .partial()
  .extend({
    // bomCode is immutable once created — strip if sent
    bomCode: z.never().optional(),
  })
  .superRefine(checkSubstitutes);

export const bomFilterSchema = z.object({
  outputItemId: z.string().uuid().optional(),
  isActive: z
    .union([z.boolean(), z.literal('true'), z.literal('false')])
    .transform((v) => (typeof v === 'boolean' ? v : v === 'true'))
    .optional(),
  search: z.string().optional(),
  /** 'category' orders by the output product's category tree so a paginated
   *  list can be sectioned without a group straddling a page boundary.
   *  Defaults to newest-first. */
  sort: z.enum(['recent', 'category']).optional(),
});

export type CreateBomInput = z.infer<typeof createBomSchema>;
export type UpdateBomInput = z.infer<typeof updateBomSchema>;
export type BomFilter = z.infer<typeof bomFilterSchema>;
