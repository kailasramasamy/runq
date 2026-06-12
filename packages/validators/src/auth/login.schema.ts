import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  tenant: z.string().optional(),
});

export const registerSchema = z.object({
  companyName: z.string().min(2).max(255),
  slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  name: z.string().min(2).max(255).refine((v) => !v.includes('@'), 'Name cannot be an email address'),
  email: z.string().email(),
  password: z.string().min(8),
  // Optional captured-at-signup profile fields
  state: z.string().max(100).optional(),
  stateCode: z.string().max(2).optional(),
  gstin: z.string().max(15).optional(),
  industry: z.string().max(100).optional(),
});

// Invite flows (Phase 1 multi-tenant)
//   new_tenant  — CA invites a prospect → creates a new tenant on accept
//   join_tenant — tenant owner invites a CA / teammate → attaches to existing tenant
export const createInviteSchema = z.object({
  inviteType: z.enum(['new_tenant', 'join_tenant']).optional().default('new_tenant'),
  role: z.enum(['accountant', 'viewer']).optional(),
  email: z.string().email().optional(),
  // CA-prefilled company name on new_tenant invites; ignored for join_tenant.
  companyName: z.string().min(2).max(255).optional(),
  note: z.string().max(500).optional(),
  expiresInDays: z.number().int().min(1).max(30).optional(),
  // When true and `email` is set, the API sends the invite link to that email.
  sendEmail: z.boolean().optional(),
});

// new_tenant accept payload — full registration (creates tenant + user)
export const acceptInviteSchema = registerSchema.extend({
  token: z.string().min(10).max(64),
});

// join_tenant accept payload — three sub-flows:
//   (a) logged-in user: empty body (just token in URL) → attach existing user to inviting tenant
//   (b) brand-new user: name + email + password → register + attach
//   (c) existing user not logged in: email + password → login + attach
export const acceptJoinInviteSchema = z.object({
  token: z.string().min(10).max(64),
  // Optional — only required when caller is unauthenticated AND wants to register.
  name: z.string().min(2).max(255).refine((v) => !v.includes('@'), 'Name cannot be an email address').optional(),
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
});

// Change password for a logged-in user — verifies the current password
// before setting the new one. Distinct from a forgot-password email reset.
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type CreateInviteInput = z.infer<typeof createInviteSchema>;
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;
export type AcceptJoinInviteInput = z.infer<typeof acceptJoinInviteSchema>;
