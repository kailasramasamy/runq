import { z } from 'zod';

/**
 * Dhenu milk-procurement — farmer/society master validators.
 * Spec: docs/dhenu-schema-spec.md §3.2–3.3.
 *
 * A farmer's financial identity is a `vendors` row. On create, either link an
 * existing `vendorId` or pass bank details and the service auto-creates one.
 * Optionally pass `nodeId` to register a primary VMCC membership at create.
 */

const boolFilter = z
  .union([z.boolean(), z.literal('true'), z.literal('false')])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const createFarmerSchema = z.object({
  code: z.string().min(1, 'Farmer code required').max(40),
  name: z.string().min(1).max(255),
  phone: z.string().max(20).nullish(),
  isSociety: z.boolean().default(false),
  defaultMilkType: z.enum(['cow', 'buffalo', 'mixed']).default('cow'),
  cattleCount: z.number().int().nonnegative().nullish(),
  kycDocId: z.string().uuid().nullish(),
  // financial identity: link existing vendor, or auto-create from these
  vendorId: z.string().uuid().nullish(),
  bankAccountName: z.string().max(255).nullish(),
  bankAccountNumber: z.string().max(30).nullish(),
  bankIfsc: z.string().max(11).nullish(),
  bankName: z.string().max(255).nullish(),
  // optional primary VMCC membership created alongside the farmer
  nodeId: z.string().uuid().nullish(),
});

export const updateFarmerSchema = createFarmerSchema.partial().extend({
  code: z.never().optional(),
  vendorId: z.never().optional(), // vendor link is immutable
});

export const farmerFilterSchema = z.object({
  nodeId: z.string().uuid().optional(), // members of a given VMCC
  search: z.string().optional(),
  isActive: boolFilter.optional(),
});

export type CreateFarmerInput = z.infer<typeof createFarmerSchema>;
export type UpdateFarmerInput = z.infer<typeof updateFarmerSchema>;
export type FarmerFilter = z.infer<typeof farmerFilterSchema>;
