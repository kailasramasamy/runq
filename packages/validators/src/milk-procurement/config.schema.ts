import { z } from 'zod';

/**
 * Dhenu milk-procurement — tenant config validators.
 * Spec: docs/dhenu-schema-spec.md §7.3. One-per-tenant GL account mapping +
 * default payout mode.
 */

export const upsertGlSettingsSchema = z.object({
  defaultPayoutMode: z.enum(['direct_to_farmer', 'via_vmcc']).optional(),
  // Cycle cadence: typically 10 or 15 days; weekly/monthly allowed (1–31).
  cycleDays: z.number().int().min(1).max(31).nullish(),
  cycleAnchorDate: z.string().date().nullish(),
  autoGenerateCycle: z.boolean().optional(),
  // Support contacts surfaced on the app's Help & Support screen.
  supportPhone: z.string().trim().max(20).nullish(),
  supportEmail: z.string().trim().email().max(120).nullish(),
  supportWhatsapp: z.string().trim().max(20).nullish(),
  milkPurchaseAccountId: z.string().uuid().nullish(),
  farmerPayableAccountId: z.string().uuid().nullish(),
  qualityBonusAccountId: z.string().uuid().nullish(),
  advanceAccountId: z.string().uuid().nullish(),
  feedLoanAccountId: z.string().uuid().nullish(),
  rawMilkInventoryAccountId: z.string().uuid().nullish(),
  // Expense account for VMCC operator commission/handling, booked on bill pay.
  commissionExpenseAccountId: z.string().uuid().nullish(),
  // Single warehouse all PP raw-milk receipts post into (P1.2).
  rawMilkWarehouseId: z.string().uuid().nullish(),
  varianceAccountId: z.string().uuid().nullish(),
}).superRefine((v, ctx) => {
  // Auto-roll needs a defined cadence to compute period boundaries.
  if (v.autoGenerateCycle && (v.cycleDays == null || v.cycleAnchorDate == null)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'cycleDays and cycleAnchorDate are required to auto-generate cycles',
      path: ['autoGenerateCycle'],
    });
  }
});

export type UpsertGlSettingsInput = z.infer<typeof upsertGlSettingsSchema>;

const milkTypeEnum = z.enum(['cow', 'buffalo', 'mixed', 'cow_a1', 'cow_a2']);

/** Replace the per-milk-type → inventory item map (P1.2). */
export const upsertRawMilkItemsSchema = z.object({
  mappings: z.array(z.object({
    milkType: milkTypeEnum,
    itemId: z.string().uuid(),
  })).max(5),
});

export type UpsertRawMilkItemsInput = z.infer<typeof upsertRawMilkItemsSchema>;
