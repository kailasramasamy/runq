import { z } from 'zod';

const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

export const createCustomerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  type: z.enum(['b2b', 'payment_gateway']).default('b2b'),
  email: z.string().email().nullish(),
  phone: z.string().max(20).nullish(),
  gstin: z.string().regex(gstinRegex, 'Invalid GSTIN format').nullish(),
  pan: z.string().regex(panRegex, 'Invalid PAN format').nullish(),
  addressLine1: z.string().max(255).nullish(),
  addressLine2: z.string().max(255).nullish(),
  city: z.string().max(100).nullish(),
  state: z.string().max(100).nullish(),
  pincode: z.string().regex(/^[1-9][0-9]{5}$/, 'Invalid pincode').nullish(),
  creditLimit: z.number().nonnegative().nullish(),
  paymentTermsDays: z.number().int().min(0).max(365).default(30),
  contactPerson: z.string().max(255).nullish(),
});

export const updateCustomerSchema = createCustomerSchema.partial();

export const customerFilterSchema = z.object({
  search: z.string().optional(),
  type: z.enum(['b2b', 'payment_gateway']).optional(),
  hasOutstanding: z.coerce.boolean().optional(),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type CustomerFilter = z.infer<typeof customerFilterSchema>;

export const syncCustomersSchema = z.object({
  customers: z.array(createCustomerSchema).min(1),
});

export const importCustomersCSVSchema = z.object({
  csvData: z.string().min(1, 'CSV data required'),
});

export type SyncCustomersInput = z.infer<typeof syncCustomersSchema>;
