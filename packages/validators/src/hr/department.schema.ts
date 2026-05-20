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

// Shared by the AI-suggest endpoints for both departments and designations.
export const suggestHrSchema = z.object({
  description: z.string().min(10).max(2000),
});

export const bulkCreateDepartmentsSchema = z.object({
  departments: z
    .array(
      z.object({
        name: z.string().min(1).max(100),
        code: z.string().max(20).nullish(),
      }),
    )
    .min(1)
    .max(50),
});

export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;
export type SuggestHrInput = z.infer<typeof suggestHrSchema>;
export type BulkCreateDepartmentsInput = z.infer<typeof bulkCreateDepartmentsSchema>;
