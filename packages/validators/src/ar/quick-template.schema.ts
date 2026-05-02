import { z } from 'zod';
import { hsnSacCodeSchema } from '../common/hsn.schema';

const quickTemplateItemSchema = z.object({
  itemId: z.string().uuid(),
  description: z.string().min(1).max(500),
  hsnSacCode: hsnSacCodeSchema.nullish(),
  unitPrice: z.number().nonnegative(),
  taxRate: z.number().min(0).max(100).nullish(),
  taxCategory: z.enum(['taxable', 'exempt', 'nil_rated', 'zero_rated']).nullish(),
  defaultQuantity: z.number().nonnegative(),
});

export const createQuickTemplateSchema = z.object({
  customerId: z.string().uuid(),
  name: z.string().min(1).max(255),
  paymentTermsDays: z.number().int().min(0).max(365).default(30),
  notes: z.string().nullish(),
  items: z.array(quickTemplateItemSchema).min(1),
});

export const updateQuickTemplateSchema = createQuickTemplateSchema.partial();

export const generateFromTemplateSchema = z.object({
  invoiceDate: z.string().date(),
  dueDate: z.string().date().optional(),
  quantities: z.record(z.string(), z.number().nonnegative()),
  notes: z.string().nullish(),
});

export type CreateQuickTemplateInput = z.infer<typeof createQuickTemplateSchema>;
export type UpdateQuickTemplateInput = z.infer<typeof updateQuickTemplateSchema>;
export type GenerateFromTemplateInput = z.infer<typeof generateFromTemplateSchema>;
