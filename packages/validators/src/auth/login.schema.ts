import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  tenant: z.string().min(1, 'Tenant slug is required'),
});

export type LoginInput = z.infer<typeof loginSchema>;
