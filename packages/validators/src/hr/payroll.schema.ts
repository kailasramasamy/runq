import { z } from 'zod';

export const componentTypeSchema = z.enum(['earning', 'deduction', 'reimbursement', 'statutory']);
export const calcTypeSchema = z.enum(['fixed', 'percent_of_basic', 'percent_of_ctc', 'formula']);
export const payrollRunStatusSchema = z.enum(['draft', 'processed', 'approved', 'closed']);

export const createSalaryComponentSchema = z.object({
  name: z.string().min(1).max(50),
  code: z.string().min(1).max(20),
  type: componentTypeSchema.default('earning'),
  calcType: calcTypeSchema.default('fixed'),
  defaultValue: z.number().default(0),
  isTaxable: z.boolean().default(true),
  isPfApplicable: z.boolean().default(false),
  isEsiApplicable: z.boolean().default(false),
  displayOrder: z.number().int().default(0),
  isActive: z.boolean().optional(),
});
export const updateSalaryComponentSchema = createSalaryComponentSchema.partial();

export const structureComponentInput = z.object({
  salaryComponentId: z.string().uuid(),
  value: z.number().nonnegative(),
  calcType: calcTypeSchema.default('fixed'),
});
export const createSalaryStructureSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().nullish(),
  components: z.array(structureComponentInput).default([]),
});
export const updateSalaryStructureSchema = createSalaryStructureSchema.partial();

export const assignEmployeeSalarySchema = z.object({
  employeeId: z.string().uuid(),
  salaryStructureId: z.string().uuid().nullish(),
  ctcAnnual: z.number().nonnegative(),
  effectiveFrom: z.string().date(),
});

export const createPayrollRunSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(2100),
  notes: z.string().nullish(),
});

export const updatePayslipSchema = z.object({
  earnings: z.array(z.object({ code: z.string(), name: z.string(), amount: z.number() })).optional(),
  deductions: z.array(z.object({ code: z.string(), name: z.string(), amount: z.number() })).optional(),
});

export type CreateSalaryComponentInput = z.infer<typeof createSalaryComponentSchema>;
export type UpdateSalaryComponentInput = z.infer<typeof updateSalaryComponentSchema>;
export type CreateSalaryStructureInput = z.infer<typeof createSalaryStructureSchema>;
export type UpdateSalaryStructureInput = z.infer<typeof updateSalaryStructureSchema>;
export type AssignEmployeeSalaryInput = z.infer<typeof assignEmployeeSalarySchema>;
export type CreatePayrollRunInput = z.infer<typeof createPayrollRunSchema>;
export type UpdatePayslipInput = z.infer<typeof updatePayslipSchema>;
