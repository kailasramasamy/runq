import { z } from 'zod';

/**
 * Dhenu milk-procurement — tenant config validators.
 * Spec: docs/dhenu-schema-spec.md §7.3. One-per-tenant GL account mapping +
 * default payout mode.
 */

export const upsertGlSettingsSchema = z.object({
  defaultPayoutMode: z.enum(['direct_to_farmer', 'via_vmcc']).optional(),
  milkPurchaseAccountId: z.string().uuid().nullish(),
  farmerPayableAccountId: z.string().uuid().nullish(),
  qualityBonusAccountId: z.string().uuid().nullish(),
  advanceAccountId: z.string().uuid().nullish(),
  feedLoanAccountId: z.string().uuid().nullish(),
  rawMilkInventoryAccountId: z.string().uuid().nullish(),
  varianceAccountId: z.string().uuid().nullish(),
});

export type UpsertGlSettingsInput = z.infer<typeof upsertGlSettingsSchema>;
