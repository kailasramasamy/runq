import { z } from 'zod';

export const companySettingsSchema = z.object({
  defaultPaymentTermsDays: z.number().int().min(0).max(365).optional(),
  currency: z.literal('INR').default('INR'),
  financialYearStartMonth: z.number().int().min(1).max(12).default(4),
});

export type CompanySettingsInput = z.infer<typeof companySettingsSchema>;
