import { z } from 'zod';

/**
 * Dhenu milk-procurement — report query validators.
 * Spec: docs/dhenu-tracker.md A9. Collection rollups by node + period.
 */

export const collectionReportSchema = z.object({
  nodeId: z.string().uuid().optional(),
  from: z.string().date(),
  to: z.string().date(),
});

export type CollectionReportQuery = z.infer<typeof collectionReportSchema>;
