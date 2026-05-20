import { z } from 'zod';

export const createDesignationSchema = z.object({
  name: z.string().min(1).max(100),
  level: z.number().int().min(0).max(20).nullish(),
  isActive: z.boolean().optional(),
});

export const updateDesignationSchema = createDesignationSchema.partial();

export const bulkCreateDesignationsSchema = z.object({
  designations: z
    .array(
      z.object({
        name: z.string().min(1).max(100),
        level: z.number().int().min(0).max(20).nullish(),
      }),
    )
    .min(1)
    .max(50),
});

export type CreateDesignationInput = z.infer<typeof createDesignationSchema>;
export type UpdateDesignationInput = z.infer<typeof updateDesignationSchema>;
export type BulkCreateDesignationsInput = z.infer<typeof bulkCreateDesignationsSchema>;
