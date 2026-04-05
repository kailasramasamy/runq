import { z } from 'zod';

export const createWebhookEndpointSchema = z.object({
  url: z.string().url('Must be a valid URL').max(500),
  events: z.array(z.string().min(1)).min(1, 'At least one event type required'),
  description: z.string().max(255).nullish(),
  isActive: z.boolean().default(true),
});

export const updateWebhookEndpointSchema = createWebhookEndpointSchema.partial();
