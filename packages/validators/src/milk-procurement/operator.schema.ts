import { z } from 'zod';

/**
 * Dhenu milk-procurement — node operator (comp terms) validators.
 * Spec: docs/dhenu-schema-spec.md §7.1. Terms only — actual payouts run
 * through AP/HR; commission is computed from pour volume.
 */

const boolFilter = z
  .union([z.boolean(), z.literal('true'), z.literal('false')])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const createNodeOperatorSchema = z
  .object({
    nodeId: z.string().uuid(),
    userId: z.string().uuid().nullish(),
    // Responsible person's display name (shown in web & app).
    name: z.string().max(255).nullish(),
    payeeVendorId: z.string().uuid().nullish(),
    // Optional Dhenu app login for this operator: phone + DOB (DDMMYY) →
    // provisions an mp_credentials row (role field_operator). Independent of HR.
    loginPhone: z.string().max(20).nullish(),
    loginDob: z.string().date().nullish(),
    role: z.enum(['operator', 'owner']).default('operator'),
    compType: z.enum(['per_litre_commission', 'fixed_salary']),
    ratePerLitre: z.number().nonnegative().nullish(),
    monthlySalary: z.number().nonnegative().nullish(),
    rentAmount: z.number().nonnegative().nullish(),
    effectiveFrom: z.string().date(),
    effectiveTo: z.string().date().nullish(),
  })
  .refine(
    (d) => (d.compType === 'per_litre_commission' ? d.ratePerLitre != null : d.monthlySalary != null),
    { message: 'per_litre_commission needs ratePerLitre; fixed_salary needs monthlySalary', path: ['compType'] },
  );

export const nodeOperatorFilterSchema = z.object({
  nodeId: z.string().uuid().optional(),
  isActive: boolFilter.optional(),
});

export const operatorCompQuerySchema = z.object({
  nodeId: z.string().uuid(),
  from: z.string().date(),
  to: z.string().date(),
});

export type CreateNodeOperatorInput = z.infer<typeof createNodeOperatorSchema>;
export type NodeOperatorFilter = z.infer<typeof nodeOperatorFilterSchema>;
export type OperatorCompQuery = z.infer<typeof operatorCompQuerySchema>;
