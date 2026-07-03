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

/** Cattle breeds collected on the farmer profile (cow + common buffalo). */
export const cattleBreedSchema = z.enum([
  'desi_natti', 'crossbred', 'jersey', 'hf', 'gir', 'sahiwal', 'murrah', 'other',
]);

/** One herd-composition row: a breed and how many head of it. */
export const cattleBreedCountSchema = z.object({
  breed: cattleBreedSchema,
  count: z.number().int().positive(),
});

export const createFarmerSchema = z.object({
  // Optional: operators don't assign codes — the service auto-generates one
  // from the node when omitted.
  code: z.string().min(1).max(40).optional(),
  name: z.string().min(1).max(255),
  // Native-script name for RL display. Provided by the operator (confirmed) on
  // create/update → marks the row verified; left null → falls back to `name`.
  nameNative: z.string().max(255).nullish(),
  phone: z.string().max(20).nullish(),
  village: z.string().max(120).nullish(),
  address: z.string().max(1000).nullish(),
  aadhaar: z.string().regex(/^\d{12}$/, 'Aadhaar must be 12 digits').nullish(),
  isSociety: z.boolean().default(false),
  defaultMilkType: z.enum(['cow', 'buffalo', 'mixed', 'cow_a1', 'cow_a2']).default('cow_a1'),
  // Herd: per-breed counts. `cattleCount` is derived (sum) server-side.
  cattleBreeds: z.array(cattleBreedCountSchema).nullish(),
  cattleCount: z.number().int().nonnegative().nullish(),
  inMilkCount: z.number().int().nonnegative().nullish(),
  // Farm GPS pin (operator captures on-site).
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
  kycDocId: z.string().uuid().nullish(),
  photoDocId: z.string().uuid().nullish(),
  // financial identity: link existing vendor, or auto-create from these
  vendorId: z.string().uuid().nullish(),
  bankAccountName: z.string().max(255).nullish(),
  bankAccountNumber: z.string().max(30).nullish(),
  bankIfsc: z.string().max(11).nullish(),
  bankName: z.string().max(255).nullish(),
  upiId: z.string().max(64).nullish(),
  // optional primary VMCC membership created alongside the farmer
  nodeId: z.string().uuid().nullish(),
});

export const updateFarmerSchema = createFarmerSchema.partial().extend({
  code: z.never().optional(),
  vendorId: z.never().optional(), // vendor link is immutable
});

/** Query for a farmer's per-cycle pour statement (PDF/HTML export). */
export const pourStatementQuerySchema = z.object({
  from: z.string().date(),
  to: z.string().date(),
  label: z.string().max(60).optional(), // cycle label shown in the header
  format: z.enum(['pdf', 'html']).default('pdf'),
});

export const farmerFilterSchema = z.object({
  nodeId: z.string().uuid().optional(), // members of a given VMCC
  search: z.string().optional(),
  isActive: boolFilter.optional(),
});

/** Live transliteration suggestion for the add-farmer native-name field. */
export const transliterateNameSchema = z.object({
  name: z.string().min(1).max(255),
  lang: z.string().min(2).max(8), // target language code (ta, kn, hi, …)
});

export type PourStatementQuery = z.infer<typeof pourStatementQuerySchema>;
export type CreateFarmerInput = z.infer<typeof createFarmerSchema>;
export type UpdateFarmerInput = z.infer<typeof updateFarmerSchema>;
export type FarmerFilter = z.infer<typeof farmerFilterSchema>;
export type TransliterateNameInput = z.infer<typeof transliterateNameSchema>;
