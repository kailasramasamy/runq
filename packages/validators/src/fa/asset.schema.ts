import { z } from 'zod';

export const createFixedAssetSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).nullish(),
  categoryId: z.string().uuid(),
  acquisitionDate: z.string().date(),
  acquisitionCost: z.number().positive(),
  residualValue: z.number().min(0).default(0),
  putToUseDate: z.string().date().nullish(),
  location: z.string().max(255).nullish(),
  serialNumber: z.string().max(100).nullish(),
  purchaseInvoiceId: z.string().uuid().nullish(),
  vendorId: z.string().uuid().nullish(),
  gstCreditClaimed: z.boolean().default(false),
  gstAmount: z.number().min(0).default(0),
});

export const updateFixedAssetSchema = createFixedAssetSchema.partial();

export const fixedAssetFilterSchema = z.object({
  categoryId: z.string().uuid().optional(),
  status: z.enum(['active', 'disposed', 'written_off', 'cwip']).optional(),
  search: z.string().optional(),
});

export type CreateFixedAssetInput = z.infer<typeof createFixedAssetSchema>;
export type UpdateFixedAssetInput = z.infer<typeof updateFixedAssetSchema>;
export type FixedAssetFilter = z.infer<typeof fixedAssetFilterSchema>;
