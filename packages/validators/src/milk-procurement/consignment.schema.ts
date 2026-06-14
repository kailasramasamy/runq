import { z } from 'zod';

/**
 * Dhenu milk-procurement — tier-to-tier consignment validators.
 * Spec: docs/dhenu-schema-spec.md §5.2. VMCC→CC and CC→PP movements with
 * dispatch + receipt QC; variance computed on receipt.
 */

export const createConsignmentSchema = z.object({
  kind: z.enum(['vmcc_to_cc', 'cc_to_pp']),
  fromNodeId: z.string().uuid(),
  toNodeId: z.string().uuid(),
  collectionDate: z.string().date(),
  shift: z.enum(['am', 'pm']).nullish(),
  containerNo: z.string().max(40).nullish(),
  dispatchQty: z.number().positive(),
  dispatchFat: z.number().min(0).max(15).nullish(),
  dispatchSnf: z.number().min(0).max(15).nullish(),
});

export const receiveConsignmentSchema = z.object({
  receiptQty: z.number().nonnegative(),
  receiptFat: z.number().min(0).max(15).nullish(),
  receiptSnf: z.number().min(0).max(15).nullish(),
});

export const consignmentFilterSchema = z.object({
  kind: z.enum(['vmcc_to_cc', 'cc_to_pp']).optional(),
  fromNodeId: z.string().uuid().optional(),
  toNodeId: z.string().uuid().optional(),
  collectionDate: z.string().date().optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  status: z.enum(['in_transit', 'received', 'reversed']).optional(),
});

/** How much milk is on hand at a source node on a date, ready to dispatch onward. */
export const consignmentAvailabilitySchema = z.object({
  nodeId: z.string().uuid(),
  collectionDate: z.string().date(),
});

export type CreateConsignmentInput = z.infer<typeof createConsignmentSchema>;
export type ReceiveConsignmentInput = z.infer<typeof receiveConsignmentSchema>;
export type ConsignmentFilter = z.infer<typeof consignmentFilterSchema>;
export type ConsignmentAvailabilityQuery = z.infer<typeof consignmentAvailabilitySchema>;
