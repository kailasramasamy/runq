import { z } from 'zod';

const priceListItemSchema = z.object({
  itemId: z.string().uuid(),
  rate: z.number().min(0),
  marginPercent: z.number().min(0).max(100).nullish(),
  discountPercent: z.number().min(0).max(100).nullish(),
  minQuantity: z.number().min(0).nullish(),
});

export const createPriceListSchema = z
  .object({
    name: z.string().min(1).max(255),
    type: z.enum(['selling', 'buying']),
    currency: z.string().length(3).default('INR'),
    applyTo: z.enum(['all', 'customer_group', 'vendor_group', 'customer', 'vendor']).default('all'),
    applyToValue: z.string().max(255).nullish(),
    customerId: z.string().uuid().nullish(),
    vendorId: z.string().uuid().nullish(),
    validFrom: z.string().nullish(),
    validTo: z.string().nullish(),
    items: z.array(priceListItemSchema).min(1),
  })
  .superRefine((data, ctx) => {
    if (data.applyTo === 'customer' && !data.customerId) {
      ctx.addIssue({ code: 'custom', path: ['customerId'], message: 'Customer is required' });
    }
    if (data.applyTo === 'vendor' && !data.vendorId) {
      ctx.addIssue({ code: 'custom', path: ['vendorId'], message: 'Vendor is required' });
    }
    if ((data.applyTo === 'customer_group' || data.applyTo === 'vendor_group') && !data.applyToValue) {
      ctx.addIssue({ code: 'custom', path: ['applyToValue'], message: 'Group name is required' });
    }
  });

export const updatePriceListSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    type: z.enum(['selling', 'buying']).optional(),
    currency: z.string().length(3).optional(),
    applyTo: z.enum(['all', 'customer_group', 'vendor_group', 'customer', 'vendor']).optional(),
    applyToValue: z.string().max(255).nullish(),
    customerId: z.string().uuid().nullish(),
    vendorId: z.string().uuid().nullish(),
    validFrom: z.string().nullish(),
    validTo: z.string().nullish(),
    items: z.array(priceListItemSchema).min(1).optional(),
  });

export const priceListFilterSchema = z.object({
  search: z.string().optional(),
  type: z.enum(['selling', 'buying']).optional(),
  applyTo: z.enum(['all', 'customer_group', 'vendor_group', 'customer', 'vendor']).optional(),
});

export type CreatePriceListInput = z.infer<typeof createPriceListSchema>;
export type UpdatePriceListInput = z.infer<typeof updatePriceListSchema>;
export type PriceListFilterInput = z.infer<typeof priceListFilterSchema>;
export type PriceListItemInput = z.infer<typeof priceListItemSchema>;
