import { z } from 'zod';

/**
 * Dhenu milk-procurement — tier-to-tier consignment validators.
 * Spec: docs/dhenu-schema-spec.md §5.2. VMCC→CC and CC→PP movements with
 * dispatch + receipt QC; variance computed on receipt.
 */

const milkTypeEnum = z.enum(['cow', 'buffalo', 'mixed', 'cow_a1', 'cow_a2']);

export const createConsignmentSchema = z.object({
  kind: z.enum(['vmcc_to_cc', 'cc_to_pp']),
  fromNodeId: z.string().uuid(),
  toNodeId: z.string().uuid(),
  collectionDate: z.string().date(),
  shift: z.enum(['am', 'pm']).nullish(),
  /** Each milk type travels as its own consignment so the type survives to the
   * plant's raw-milk stock. Optional only for older clients; the service falls
   * back to deriving it and rejects a dispatch that would blend two types. */
  milkType: milkTypeEnum.nullish(),
  containerNo: z.string().max(40).nullish(),
  dispatchQty: z.number().positive(),
  dispatchFat: z.number().min(0).max(15).nullish(),
  dispatchSnf: z.number().min(0).max(15).nullish(),
  dispatchWater: z.number().min(0).max(100).nullish(),
});

export const receiveConsignmentSchema = z.object({
  receiptQty: z.number().nonnegative(),
  receiptFat: z.number().min(0).max(15).nullish(),
  receiptSnf: z.number().min(0).max(15).nullish(),
  receiptWater: z.number().min(0).max(100).nullish(),
});

/** Ad-hoc receive at the destination for milk that physically arrived without a
 * dispatch entry (operator forgot to mark dispatch, or doesn't use the app and
 * works off a notebook). Creates a consignment already marked received. */
export const directReceiveConsignmentSchema = z.object({
  fromNodeId: z.string().uuid(),
  toNodeId: z.string().uuid(),
  collectionDate: z.string().date(),
  shift: z.enum(['am', 'pm']).nullish(),
  /** Omit and the server resolves it from the source centre's configuration. */
  milkType: milkTypeEnum.nullish(),
  qty: z.number().positive(),
  fat: z.number().min(0).max(15).nullish(),
  snf: z.number().min(0).max(15).nullish(),
  water: z.number().min(0).max(100).nullish(),
});

/**
 * Single-site fast track: run the whole VMCC→CC→PP chain for one collection
 * slot in one call. `plan` previews it, `run` commits it — both take the same
 * body, so the operator confirms exactly what was previewed.
 *
 * `shift` names the slot for per_shift nodes and is ignored by pooled ones (the
 * node's dispatch mode owns its window). `vmccNodeIds` narrows the sweep to
 * named centres; omit it and every eligible VMCC the operator is assigned to
 * runs.
 */
export const fastTrackSchema = z.object({
  collectionDate: z.string().date(),
  shift: z.enum(['am', 'pm']).optional(),
  vmccNodeIds: z.array(z.string().uuid()).min(1).optional(),
});

export const consignmentFilterSchema = z.object({
  kind: z.enum(['vmcc_to_cc', 'cc_to_pp']).optional(),
  fromNodeId: z.string().uuid().optional(),
  toNodeId: z.string().uuid().optional(),
  collectionDate: z.string().date().optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  shift: z.enum(['am', 'pm']).optional(),
  status: z.enum(['in_transit', 'received', 'reversed']).optional(),
});

/** How much milk is on hand at a source node on a date, ready to dispatch onward.
 * `shift` scopes the figure to AM/PM for no-BMC nodes that dispatch each shift
 * separately; omit it for BMC nodes that pool the whole day. */
export const consignmentAvailabilitySchema = z.object({
  nodeId: z.string().uuid(),
  collectionDate: z.string().date(),
  shift: z.enum(['am', 'pm']).optional(),
  /** Scope the headline figures to one milk type. The response always carries the
   * full per-type breakdown regardless, so callers can render one card per type. */
  milkType: milkTypeEnum.optional(),
});

/** Slots at a node still holding undispatched milk. Unbounded in the past by
 * design — a shift closed months ago and never dispatched is still a real gap. */
export const pendingDispatchSchema = z.object({
  nodeId: z.string().uuid(),
});

export type CreateConsignmentInput = z.infer<typeof createConsignmentSchema>;
export type ReceiveConsignmentInput = z.infer<typeof receiveConsignmentSchema>;
export type DirectReceiveConsignmentInput = z.infer<typeof directReceiveConsignmentSchema>;
export type ConsignmentFilter = z.infer<typeof consignmentFilterSchema>;
export type FastTrackInput = z.infer<typeof fastTrackSchema>;
export type ConsignmentAvailabilityQuery = z.infer<typeof consignmentAvailabilitySchema>;
export type PendingDispatchQuery = z.infer<typeof pendingDispatchSchema>;

/**
 * Walk a load's whole chain back — plant receipt, CC dispatch, CC receipt,
 * VMCC dispatch — from one place, instead of hopping between modes and finding
 * half the screens scoped to today.
 */
export const unwindSchema = z.object({
  consignmentId: z.string().uuid(),
  /**
   * Also reopen the VMCC's shift and reverse the pours behind the load.
   * Off by default and never implied: reversing a pour takes a farmer's
   * payment away, which is a different decision from removing a duplicate leg.
   */
  includePours: z.boolean().default(false),
});

export type UnwindInput = z.infer<typeof unwindSchema>;
