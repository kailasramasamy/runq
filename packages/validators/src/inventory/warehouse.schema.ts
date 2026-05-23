import { z } from 'zod';

export const warehouseTypeSchema = z.enum(['main', 'godown', 'shop', 'vehicle', 'virtual']);

export const createWarehouseSchema = z.object({
  code: z.string().min(1).max(30),
  name: z.string().min(1).max(120),
  type: warehouseTypeSchema.default('godown'),
  address: z.string().max(500).nullish(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const updateWarehouseSchema = createWarehouseSchema.partial();

export type CreateWarehouseInput = z.infer<typeof createWarehouseSchema>;
export type UpdateWarehouseInput = z.infer<typeof updateWarehouseSchema>;
export type WarehouseType = z.infer<typeof warehouseTypeSchema>;
