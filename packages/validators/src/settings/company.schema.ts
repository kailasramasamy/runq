import { z } from 'zod';

const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export const companySettingsSchema = z.object({
  defaultPaymentTermsDays: z.number().int().min(0).max(365).optional(),
  currency: z.literal('INR').default('INR'),
  financialYearStartMonth: z.number().int().min(1).max(12).default(4),
  // Company GST profile
  gstin: z.string().regex(gstinRegex, 'Invalid GSTIN format').nullish(),
  legalName: z.string().max(255).nullish(),
  state: z.string().max(100).nullish(),
  stateCode: z.string().max(2).nullish(),
  addressLine1: z.string().max(255).nullish(),
  addressLine2: z.string().max(255).nullish(),
  city: z.string().max(100).nullish(),
  pincode: z.string().regex(/^[1-9][0-9]{5}$/, 'Invalid pincode').nullish(),
  // UPI collection
  upiId: z.string().max(100).nullish(),
});

export type CompanySettingsInput = z.infer<typeof companySettingsSchema>;
