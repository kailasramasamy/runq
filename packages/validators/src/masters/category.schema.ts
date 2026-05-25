import { z } from 'zod';
import { hsnSacCodeSchema } from '../common/hsn.schema';

export const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  parentId: z.string().uuid().nullish(),
  defaultHsnSac: hsnSacCodeSchema.nullish(),
  defaultGstRate: z.number().min(0).max(100).nullish(),
  sortOrder: z.number().int().min(0).optional(),
});

export const updateCategorySchema = createCategorySchema.partial();

export const categoryFilterSchema = z.object({
  search: z.string().optional(),
  parentId: z.string().uuid().optional(),
  rootOnly: z.coerce.boolean().optional(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CategoryFilterInput = z.infer<typeof categoryFilterSchema>;
