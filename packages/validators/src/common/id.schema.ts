import { z } from 'zod';

export const uuidSchema = z.string().uuid('Invalid UUID');

export const uuidParamSchema = z.object({
  id: uuidSchema,
});

export type UUIDParam = z.infer<typeof uuidParamSchema>;
