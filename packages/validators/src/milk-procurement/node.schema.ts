import { z } from 'zod';

/**
 * Dhenu milk-procurement — collection-network node validators.
 * Spec: docs/dhenu-schema-spec.md §3.1.
 *
 * Writes are type-specific: each node type (VMCC / CC / PP) has its own create
 * and update schema so a type only accepts the fields that are meaningful to it
 * (a CC can't be sent VMCC milk-testing fields, etc.). `nodeType` is NOT part of
 * these schemas — the typed route injects it. Reads stay shared via nodeFilterSchema.
 */

const boolFilter = z
  .union([z.boolean(), z.literal('true'), z.literal('false')])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

const milkTypeEnum = z.enum(['cow', 'buffalo', 'mixed', 'cow_a1', 'cow_a2']);

// Fields common to every node type.
const baseNodeFields = z.object({
  code: z.string().min(1, 'Node code required').max(40),
  name: z.string().min(1).max(255),
  parentNodeId: z.string().uuid().nullish(),
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

// VMCC-only: milk testing, collection shifts, and accepted milk types.
const vmccFields = baseNodeFields.extend({
  hasBmc: z.boolean().default(false),
  // analyzer = fat/SNF testing; lactometer = CLR-only (VMCC without an analyzer)
  measurementMode: z.enum(['analyzer', 'lactometer']).default('analyzer'),
  // which shifts a VMCC collects in — both (default) | am | pm
  collectionShifts: z.enum(['both', 'am', 'pm']).default('both'),
  // milk type(s) this VMCC collects; null = all (legacy). defaultMilkType
  // pre-selects the operator picker and must be within allowedMilkTypes.
  allowedMilkTypes: z.array(milkTypeEnum).min(1).nullish(),
  defaultMilkType: milkTypeEnum.nullish(),
});

// CC-only: overnight pooling (prev-day PM + today AM).
const ccFields = baseNodeFields.extend({
  hasBmc: z.boolean().default(false),
  overnightPooling: z.boolean().default(false),
});

// PP: shared fields only.
const ppFields = baseNodeFields;

// defaultMilkType, when set alongside an explicit allowed list, must be in it.
const defaultWithinAllowed = (d: { defaultMilkType?: unknown; allowedMilkTypes?: readonly string[] | null }) =>
  d.defaultMilkType == null || d.allowedMilkTypes == null
  || d.allowedMilkTypes.includes(d.defaultMilkType as string);
const defaultWithinAllowedMsg = { message: 'defaultMilkType must be one of allowedMilkTypes', path: ['defaultMilkType'] };

// `code` is immutable once created — strip it if sent on update.
const immutableCode = { code: z.never().optional() };

export const createVmccSchema = vmccFields.refine(defaultWithinAllowed, defaultWithinAllowedMsg);
export const updateVmccSchema = vmccFields.partial().extend(immutableCode).refine(defaultWithinAllowed, defaultWithinAllowedMsg);

export const createChillingCentreSchema = ccFields;
export const updateChillingCentreSchema = ccFields.partial().extend(immutableCode);

export const createProcessingPlantSchema = ppFields;
export const updateProcessingPlantSchema = ppFields.partial().extend(immutableCode);

export const nodeFilterSchema = z.object({
  nodeType: z.enum(['vmcc', 'cc', 'pp']).optional(),
  parentNodeId: z.string().uuid().optional(),
  search: z.string().optional(),
  isActive: boolFilter.optional(),
});

export type CreateVmccInput = z.infer<typeof createVmccSchema>;
export type UpdateVmccInput = z.infer<typeof updateVmccSchema>;
export type CreateChillingCentreInput = z.infer<typeof createChillingCentreSchema>;
export type UpdateChillingCentreInput = z.infer<typeof updateChillingCentreSchema>;
export type CreateProcessingPlantInput = z.infer<typeof createProcessingPlantSchema>;
export type UpdateProcessingPlantInput = z.infer<typeof updateProcessingPlantSchema>;

// Service-facing shapes: the base fields plus every type-specific field as
// optional, so NodeService can write one column set regardless of node type
// (omitted fields arrive `undefined` and fall through to the DB defaults). Any
// parsed typed-create object is assignable to these.
type NodeTypeSpecific = {
  hasBmc?: boolean;
  overnightPooling?: boolean;
  measurementMode?: z.infer<typeof vmccFields>['measurementMode'];
  collectionShifts?: z.infer<typeof vmccFields>['collectionShifts'];
  allowedMilkTypes?: z.infer<typeof milkTypeEnum>[] | null;
  defaultMilkType?: z.infer<typeof milkTypeEnum> | null;
};
export type CreateNodeInput = z.infer<typeof baseNodeFields> & { nodeType: 'vmcc' | 'cc' | 'pp' } & NodeTypeSpecific;
export type UpdateNodeInput = Partial<z.infer<typeof baseNodeFields>> & NodeTypeSpecific;
export type NodeFilter = z.infer<typeof nodeFilterSchema>;
