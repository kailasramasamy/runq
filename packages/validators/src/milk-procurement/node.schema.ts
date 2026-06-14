import { z } from 'zod';

/**
 * Dhenu milk-procurement — collection-network node (VMCC / CC / PP) validators.
 * Spec: docs/dhenu-schema-spec.md §3.1.
 */

const boolFilter = z
  .union([z.boolean(), z.literal('true'), z.literal('false')])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const createNodeSchema = z.object({
  code: z.string().min(1, 'Node code required').max(40),
  name: z.string().min(1).max(255),
  nodeType: z.enum(['vmcc', 'cc', 'pp']),
  parentNodeId: z.string().uuid().nullish(),
  hasBmc: z.boolean().default(false),
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

export const updateNodeSchema = createNodeSchema.partial().extend({
  // code is immutable once created — strip if sent
  code: z.never().optional(),
});

export const nodeFilterSchema = z.object({
  nodeType: z.enum(['vmcc', 'cc', 'pp']).optional(),
  parentNodeId: z.string().uuid().optional(),
  search: z.string().optional(),
  isActive: boolFilter.optional(),
});

export type CreateNodeInput = z.infer<typeof createNodeSchema>;
export type UpdateNodeInput = z.infer<typeof updateNodeSchema>;
export type NodeFilter = z.infer<typeof nodeFilterSchema>;
