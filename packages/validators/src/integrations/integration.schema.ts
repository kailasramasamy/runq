import { z } from 'zod';

export const createIntegrationSchema = z.object({
  provider: z.string().min(1).max(50),
  config: z.record(z.unknown()).default({}),
});

export const updateIntegrationSchema = z.object({
  isActive: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
});

export const triggerSyncSchema = z.object({
  action: z.string().min(1).max(100),
});

export type CreateIntegrationInput = z.infer<typeof createIntegrationSchema>;
export type UpdateIntegrationInput = z.infer<typeof updateIntegrationSchema>;
export type TriggerSyncInput = z.infer<typeof triggerSyncSchema>;
