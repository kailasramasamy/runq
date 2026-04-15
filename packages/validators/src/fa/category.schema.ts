import { z } from 'zod';

export const createAssetCategorySchema = z.object({
  name: z.string().min(1).max(100),
  parentId: z.string().uuid().nullish(),
  depMethodCompaniesAct: z.enum(['slm', 'wdv']).default('slm'),
  depRateCompaniesAct: z.number().min(0).max(100),
  usefulLifeYears: z.number().int().positive().nullish(),
  depMethodItAct: z.enum(['slm', 'wdv']).default('wdv'),
  depRateItAct: z.number().min(0).max(100),
  assetAccountCode: z.string().min(1).max(20),
  depExpenseAccountCode: z.string().min(1).max(20),
  accumDepAccountCode: z.string().min(1).max(20),
});

export const updateAssetCategorySchema = createAssetCategorySchema.partial();

export type CreateAssetCategoryInput = z.infer<typeof createAssetCategorySchema>;
export type UpdateAssetCategoryInput = z.infer<typeof updateAssetCategorySchema>;
