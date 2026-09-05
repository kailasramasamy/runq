import { z } from 'zod';

/**
 * Dhenu milk-procurement — milk refused for quality.
 *
 * Recorded instead of erased. The pour or receipt it came from stays, with its
 * reading; the rejection carries the litres, the reason and who is out of
 * pocket. Cancelling the chain instead withholds the money but destroys the
 * evidence, which is how a farmer refused every week came to look identical to
 * one never refused.
 */

export const rejectionReasonEnum = z.enum([
  'sour', 'adulterated', 'temperature', 'cob_positive', 'antibiotic',
  'foreign_matter', 'other',
]);

export const rejectionDispositionEnum = z.enum(['returned', 'destroyed']);

/** 'other' with no note is unauditable a month later, when the reason is the
 *  only thing anyone wants to know. Mirrors the DB check constraint. */
const notesForOther = (v: { reason: string; notes?: string | null }, ctx: z.RefinementCtx) => {
  if (v.reason === 'other' && !v.notes?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom, path: ['notes'],
      message: 'Say what was wrong with the milk',
    });
  }
};

/**
 * Refuse a farmer's milk at the gate. No pour is created for these litres, so
 * nothing accrues and there is nothing to deduct later — which is what makes
 * this the cheapest place in the network to catch bad milk.
 */
export const gateRejectionSchema = z.object({
  nodeId: z.string().uuid(),
  farmerId: z.string().uuid(),
  collectionDate: z.string().date(),
  shift: z.enum(['am', 'pm']),
  milkType: z.enum(['cow', 'buffalo', 'mixed', 'cow_a1', 'cow_a2']),
  qtyLitres: z.number().positive(),
  reason: rejectionReasonEnum,
  notes: z.string().max(500).nullish(),
  disposition: rejectionDispositionEnum.default('returned'),
  // The reading that justified the call, kept so the refusal can be defended.
  fat: z.number().nonnegative().nullish(),
  snf: z.number().nonnegative().nullish(),
  clr: z.number().nonnegative().nullish(),
}).superRefine(notesForOther);

/**
 * Refuse part of an incoming load, at a CC or the plant. Rides on the receive
 * call: the receipt records what was ACCEPTED and this records what was not, so
 * the rejected litres never enter the pool or the raw-milk stock.
 */
export const receiptRejectionSchema = z.object({
  qtyLitres: z.number().positive(),
  reason: rejectionReasonEnum,
  notes: z.string().max(500).nullish(),
  disposition: rejectionDispositionEnum.default('returned'),
  /**
   * Pin the whole rejection on one farmer instead of splitting it across
   * everyone who poured into the can. Retained-sample testing is exactly how a
   * dairy attributes adulteration to one supplier, and a named attribution
   * beats spreading blame over people who did nothing wrong.
   */
  attributeToFarmerId: z.string().uuid().nullish(),
}).superRefine(notesForOther);

/** Standalone rejection against an already-received consignment — the load was
 *  taken in, then failed a lab test hours later. */
export const consignmentRejectionSchema = receiptRejectionSchema;

export const rejectionFilterSchema = z.object({
  nodeId: z.string().uuid().optional(),
  fromNodeId: z.string().uuid().optional(),
  farmerId: z.string().uuid().optional(),
  stage: z.enum(['gate', 'cc_receipt', 'pp_receipt']).optional(),
  reason: rejectionReasonEnum.optional(),
  collectionDate: z.string().date().optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  includeReversed: z.coerce.boolean().optional(),
});

/** Rejection rate over a window, grouped by source. */
export const rejectionStatsSchema = z.object({
  from: z.string().date(),
  to: z.string().date(),
  nodeId: z.string().uuid().optional(),
  groupBy: z.enum(['farmer', 'node', 'reason']).default('node'),
});

export type GateRejectionInput = z.infer<typeof gateRejectionSchema>;
export type ReceiptRejectionInput = z.infer<typeof receiptRejectionSchema>;
export type RejectionFilter = z.infer<typeof rejectionFilterSchema>;
export type RejectionStatsQuery = z.infer<typeof rejectionStatsSchema>;
