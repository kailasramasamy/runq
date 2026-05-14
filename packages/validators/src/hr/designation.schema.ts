import { z } from 'zod';

export const createDesignationSchema = z.object({
  name: z.string().min(1).max(100),
  level: z.number().int().min(0).max(20).nullish(),
  isActive: z.boolean().optional(),
});

export const updateDesignationSchema = createDesignationSchema.partial();

export type CreateDesignationInput = z.infer<typeof createDesignationSchema>;
export type UpdateDesignationInput = z.infer<typeof updateDesignationSchema>;
