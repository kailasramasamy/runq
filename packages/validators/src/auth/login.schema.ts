import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  tenant: z.string().optional(),
});

export const registerSchema = z.object({
  companyName: z.string().min(2).max(255),
  slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  name: z.string().min(2).max(255),
  email: z.string().email(),
  password: z.string().min(8),
  // Optional captured-at-signup profile fields
  state: z.string().max(100).optional(),
  stateCode: z.string().max(2).optional(),
  gstin: z.string().max(15).optional(),
  industry: z.string().max(100).optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
