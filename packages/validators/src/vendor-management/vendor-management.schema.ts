import { z } from 'zod';

export const createVendorContractSchema = z.object({
  vendorId: z.string().uuid(),
  contractNumber: z.string().min(1).max(50),
  title: z.string().min(1).max(255),
  startDate: z.string().date(),
  endDate: z.string().date(),
  value: z.number().min(0).nullable().optional(),
  terms: z.string().max(5000).optional(),
  renewalDate: z.string().date().optional(),
});

export const createVendorRatingSchema = z.object({
  vendorId: z.string().uuid(),
  period: z.string().min(1).max(10),
  deliveryScore: z.number().int().min(1).max(5),
  qualityScore: z.number().int().min(1).max(5),
  pricingScore: z.number().int().min(1).max(5),
  notes: z.string().max(2000).optional(),
});

export const createRequisitionSchema = z.object({
  vendorId: z.string().uuid().optional(),
  description: z.string().min(1).max(2000),
  items: z
    .array(
      z.object({
        itemName: z.string().min(1).max(255),
        quantity: z.number().min(0.001),
        estimatedUnitPrice: z.number().min(0).optional(),
      }),
    )
    .min(1),
});

export const createPaymentScheduleSchema = z.object({
  name: z.string().min(1).max(100),
  scheduledDate: z.string().date(),
  items: z
    .array(
      z.object({
        invoiceId: z.string().uuid(),
        vendorId: z.string().uuid(),
        amount: z.number().min(0.01),
      }),
    )
    .min(1),
});

export type CreateVendorContractInput = z.infer<
  typeof createVendorContractSchema
>;
export type CreateVendorRatingInput = z.infer<typeof createVendorRatingSchema>;
export type CreateRequisitionInput = z.infer<typeof createRequisitionSchema>;
export type CreatePaymentScheduleInput = z.infer<
  typeof createPaymentScheduleSchema
>;
