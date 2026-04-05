import { z } from 'zod';

const salesOrderItemSchema = z.object({
  description: z.string().min(1).max(500),
  quantity: z.number().positive('Quantity must be positive'),
  unitPrice: z.number().nonnegative('Unit price must be non-negative'),
  amount: z.number().positive('Amount must be positive'),
  hsnSacCode: z.string().max(8).nullish(),
  taxRate: z.number().min(0).max(100).nullish(),
  itemId: z.string().uuid().nullish(),
});

export const createSalesOrderSchema = z.object({
  customerId: z.string().uuid(),
  orderDate: z.string().date(),
  items: z.array(salesOrderItemSchema).min(1, 'At least one line item required'),
  subtotal: z.number().nonnegative(),
  taxAmount: z.number().nonnegative().default(0),
  totalAmount: z.number().positive('Total must be positive'),
  notes: z.string().nullish(),
  quoteId: z.string().uuid().nullish(),
});

export const updateSalesOrderSchema = createSalesOrderSchema.partial();

export const salesOrderFilterSchema = z.object({
  customerId: z.string().uuid().optional(),
  status: z.enum(['draft', 'confirmed', 'partially_invoiced', 'fully_invoiced', 'cancelled']).optional(),
  search: z.string().optional(),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
});

export type CreateSalesOrderInput = z.infer<typeof createSalesOrderSchema>;
export type UpdateSalesOrderInput = z.infer<typeof updateSalesOrderSchema>;
export type SalesOrderFilter = z.infer<typeof salesOrderFilterSchema>;
