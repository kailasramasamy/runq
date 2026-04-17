import { z } from 'zod';
import { INDUSTRY_LIST } from '../masters/industry-presets';

const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export const companySettingsSchema = z.object({
  defaultPaymentTermsDays: z.number().int().min(0).max(365).optional(),
  currency: z.literal('INR').default('INR'),
  financialYearStartMonth: z.number().int().min(1).max(12).default(4),
  // Industry — drives the catalogue attribute preset seed. Changing this
  // after the fact also clears the stored itemAttributeSchema so the
  // next access re-seeds from the new preset (handled in the service).
  industry: z.enum(INDUSTRY_LIST).nullish(),
  // Company GST profile
  gstin: z.string().regex(gstinRegex, 'Invalid GSTIN format').nullish(),
  // GST portal username — used to auto-populate authentication in GST filing flow
  gstUsername: z.string().max(50).nullish(),
  // First period (MMYYYY) for which runq manages GST filing
  gstFilingStartPeriod: z.string().regex(/^(0[1-9]|1[0-2])\d{4}$/, 'Must be MMYYYY format').nullish(),
  legalName: z.string().max(255).nullish(),
  state: z.string().max(100).nullish(),
  stateCode: z.string().max(2).nullish(),
  addressLine1: z.string().max(255).nullish(),
  addressLine2: z.string().max(255).nullish(),
  city: z.string().max(100).nullish(),
  pincode: z.string().regex(/^[1-9][0-9]{5}$/, 'Invalid pincode').nullish(),
  // UPI collection
  upiId: z.string().max(100).nullish(),
  // Default margin (%) used by smart-import when source rows lack margin
  defaultMarginPercent: z.number().min(0).max(100).nullish(),
});

export type CompanySettingsInput = z.infer<typeof companySettingsSchema>;
