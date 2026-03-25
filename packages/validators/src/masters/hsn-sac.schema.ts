import { z } from 'zod';

export const hsnSacSearchSchema = z.object({
  q: z.string().min(1).max(100),
  type: z.enum(['hsn', 'sac']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const createHsnSacSchema = z.object({
  code: z.string().min(2).max(8).regex(/^[0-9]+$/, 'Code must be numeric'),
  type: z.enum(['hsn', 'sac']),
  description: z.string().min(1).max(500),
  gstRate: z.number().min(0).max(100).nullable().optional(),
});

export const updateHsnSacSchema = createHsnSacSchema.partial();

export type HsnSacSearchInput = z.infer<typeof hsnSacSearchSchema>;
export type CreateHsnSacInput = z.infer<typeof createHsnSacSchema>;
export type UpdateHsnSacInput = z.infer<typeof updateHsnSacSchema>;
