import { z } from 'zod';

export const createDepartmentSchema = z.object({
  name: z.string().min(1).max(100),
  code: z.string().max(20).nullish(),
  parentId: z.string().uuid().nullish(),
  // Department head — when set, that employee's hrAccessScope includes
  // everyone in this department in addition to their reporting subtree.
  headEmployeeId: z.string().uuid().nullish(),
  isActive: z.boolean().optional(),
});

export const updateDepartmentSchema = createDepartmentSchema.partial();

export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;
