import { z } from 'zod';

/**
 * Dhenu milk-procurement — QC test validators.
 * Spec: docs/dhenu-schema-spec.md §5.3. Richer lab params bound to a pour or
 * consignment (adulteration, MBRT, acidity, …).
 */

export const createQcTestSchema = z.object({
  subjectType: z.enum(['pour', 'consignment']),
  subjectId: z.string().uuid(),
  testCode: z.string().min(1).max(40),
  value: z.string().max(60).nullish(),
  uom: z.string().max(20).nullish(),
  verdict: z.enum(['pass', 'fail', 'conditional']).nullish(),
});

export const qcTestFilterSchema = z.object({
  subjectType: z.enum(['pour', 'consignment']).optional(),
  subjectId: z.string().uuid().optional(),
  verdict: z.enum(['pass', 'fail', 'conditional']).optional(),
});

export type CreateQcTestInput = z.infer<typeof createQcTestSchema>;
export type QcTestFilter = z.infer<typeof qcTestFilterSchema>;
