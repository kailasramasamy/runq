import { z } from 'zod';

export const depreciationRunSchema = z.object({
  periodEnd: z.string().date(),
  depreciationType: z.enum(['companies_act', 'it_act']).default('companies_act'),
});

export const depreciationPreviewSchema = depreciationRunSchema;

export type DepreciationRunInput = z.infer<typeof depreciationRunSchema>;
export type DepreciationPreviewInput = z.infer<typeof depreciationPreviewSchema>;
