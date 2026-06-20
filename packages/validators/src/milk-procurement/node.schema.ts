import { z } from 'zod';

/**
 * Dhenu milk-procurement — collection-network node (VMCC / CC / PP) validators.
 * Spec: docs/dhenu-schema-spec.md §3.1.
 */

const boolFilter = z
  .union([z.boolean(), z.literal('true'), z.literal('false')])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

const milkTypeEnum = z.enum(['cow', 'buffalo', 'mixed', 'cow_a1', 'cow_a2']);

const nodeFields = z.object({
  code: z.string().min(1, 'Node code required').max(40),
  name: z.string().min(1).max(255),
  nodeType: z.enum(['vmcc', 'cc', 'pp']),
  parentNodeId: z.string().uuid().nullish(),
  hasBmc: z.boolean().default(false),
  // analyzer = fat/SNF testing; lactometer = CLR-only (VMCC without an analyzer)
  measurementMode: z.enum(['analyzer', 'lactometer']).default('analyzer'),
  // milk type(s) this VMCC collects; null = all (legacy). defaultMilkType
  // pre-selects the operator picker and must be within allowedMilkTypes.
  allowedMilkTypes: z.array(milkTypeEnum).min(1).nullish(),
  defaultMilkType: milkTypeEnum.nullish(),
  capacityLitres: z.number().nonnegative().nullish(),
  payoutMode: z.enum(['direct_to_farmer', 'via_vmcc']).nullish(),
  payeeVendorId: z.string().uuid().nullish(),
  addressLine1: z.string().max(255).nullish(),
  addressLine2: z.string().max(255).nullish(),
  city: z.string().max(100).nullish(),
  state: z.string().max(100).nullish(),
  pincode: z.string().max(10).nullish(),
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
});

// defaultMilkType, when set alongside an explicit allowed list, must be in it.
const defaultWithinAllowed = (d: { defaultMilkType?: unknown; allowedMilkTypes?: readonly string[] | null }) =>
  d.defaultMilkType == null || d.allowedMilkTypes == null
  || d.allowedMilkTypes.includes(d.defaultMilkType as string);
const defaultWithinAllowedMsg = { message: 'defaultMilkType must be one of allowedMilkTypes', path: ['defaultMilkType'] };

export const createNodeSchema = nodeFields.refine(defaultWithinAllowed, defaultWithinAllowedMsg);

export const updateNodeSchema = nodeFields.partial().extend({
  // code is immutable once created — strip if sent
  code: z.never().optional(),
}).refine(defaultWithinAllowed, defaultWithinAllowedMsg);

export const nodeFilterSchema = z.object({
  nodeType: z.enum(['vmcc', 'cc', 'pp']).optional(),
  parentNodeId: z.string().uuid().optional(),
  search: z.string().optional(),
  isActive: boolFilter.optional(),
});

export type CreateNodeInput = z.infer<typeof createNodeSchema>;
export type UpdateNodeInput = z.infer<typeof updateNodeSchema>;
export type NodeFilter = z.infer<typeof nodeFilterSchema>;
