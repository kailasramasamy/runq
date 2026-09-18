import { z } from 'zod';
import { hsnSacCodeSchema } from '../common/hsn.schema';

export const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  parentId: z.string().uuid().nullish(),
  defaultHsnSac: hsnSacCodeSchema.nullish(),
  defaultGstRate: z.number().min(0).max(100).nullish(),
  sortOrder: z.number().int().min(0).optional(),
  /** Lead this category's items on the Manufacturing home raw-material card. */
  isPrimaryInput: z.boolean().optional(),
});

export const updateCategorySchema = createCategorySchema.partial();

export const categoryFilterSchema = z.object({
  search: z.string().optional(),
  parentId: z.string().uuid().optional(),
  rootOnly: z.coerce.boolean().optional(),
});

/**
 * Tree query. The class filters mirror itemFilterSchema so a count always
 * describes the exact set the caller would get by drilling in — a browser
 * showing "24" that opens a list of 14 is worse than showing nothing.
 */
export const categoryTreeQuerySchema = z.object({
  withCounts: z.coerce.boolean().optional(),
  itemClass: z.string().optional(),
  itemClassGroup: z
    .enum(['finished', 'inputs', 'trading', 'other', 'bom_inputs', 'all'])
    .optional(),
  unclassified: z.coerce.boolean().optional(),
});

/**
 * A whole sibling group's new order, written in one call. Drag-and-drop moves
 * every row below the one that was dragged, so the client sends the group's
 * dense 0..n-1 sequence rather than one PUT per affected row.
 */
export const reorderCategoriesSchema = z
  .array(
    z.object({
      id: z.string().uuid(),
      sortOrder: z.number().int().min(0),
    }),
  )
  .min(1)
  .max(500);

export type ReorderCategoriesInput = z.infer<typeof reorderCategoriesSchema>;
export type CategoryTreeQuery = z.infer<typeof categoryTreeQuerySchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CategoryFilterInput = z.infer<typeof categoryFilterSchema>;
