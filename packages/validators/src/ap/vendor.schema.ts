import { z } from 'zod';

const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export const createVendorSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  gstin: z.string().regex(gstinRegex, 'Invalid GSTIN format').nullish(),
  pan: z.string().regex(panRegex, 'Invalid PAN format').nullish(),
  email: z.string().email().nullish(),
  phone: z.string().max(20).nullish(),
  addressLine1: z.string().max(255).nullish(),
  addressLine2: z.string().max(255).nullish(),
  city: z.string().max(100).nullish(),
  state: z.string().max(100).nullish(),
  pincode: z.string().regex(/^[1-9][0-9]{5}$/, 'Invalid pincode').nullish(),
  bankAccountName: z.string().max(255).nullish(),
  bankAccountNumber: z.string().max(30).nullish(),
  bankIfsc: z.string().regex(ifscRegex, 'Invalid IFSC code').nullish(),
  bankName: z.string().max(255).nullish(),
  paymentTermsDays: z.number().int().min(0).max(365).default(30),
  wmsVendorId: z.string().max(100).nullish(),
  category: z.string().max(50).nullish(),
});

export const updateVendorSchema = createVendorSchema.partial();

export const vendorFilterSchema = z.object({
  search: z.string().optional(),
  hasOutstanding: z.coerce.boolean().optional(),
});

export type CreateVendorInput = z.infer<typeof createVendorSchema>;
export type UpdateVendorInput = z.infer<typeof updateVendorSchema>;
export type VendorFilter = z.infer<typeof vendorFilterSchema>;
