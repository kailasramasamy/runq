import { z } from 'zod';

export const emailProviderConfigSchema = z.object({
  emailProvider: z.enum(['resend', 'sendgrid', 'smtp']).nullable(),
  emailConfig: z.object({
    apiKey: z.string().min(1).optional(),
    smtpHost: z.string().min(1).optional(),
    smtpPort: z.number().int().min(1).max(65535).optional(),
    smtpSecure: z.boolean().optional(),
    smtpUser: z.string().optional(),
    smtpPass: z.string().optional(),
    fromEmail: z.string().email().optional(),
    fromName: z.string().max(100).optional(),
  }).optional(),
}).refine((data) => {
  if (!data.emailProvider) return true;
  const cfg = data.emailConfig;
  if (!cfg) return false;
  if (data.emailProvider === 'resend' || data.emailProvider === 'sendgrid') {
    return !!cfg.apiKey;
  }
  if (data.emailProvider === 'smtp') {
    return !!cfg.smtpHost && !!cfg.smtpPort;
  }
  return true;
}, { message: 'Missing required config fields for the selected provider' });

export const testEmailSchema = z.object({
  to: z.string().email(),
});

export type EmailProviderConfigInput = z.infer<typeof emailProviderConfigSchema>;
export type TestEmailInput = z.infer<typeof testEmailSchema>;
