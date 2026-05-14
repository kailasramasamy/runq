import { z } from 'zod';

export const employmentTypeSchema = z.enum(['permanent', 'contract', 'intern', 'consultant', 'wage']);
export const employeeStatusSchema = z.enum(['active', 'inactive', 'terminated', 'on_leave']);
export const genderSchema = z.enum(['male', 'female', 'other']);

const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const aadhaarRegex = /^[0-9]{12}$/;
const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export const createEmployeeSchema = z.object({
  employeeCode: z.string().min(1).max(30),
  firstName: z.string().min(1).max(100),
  lastName: z.string().max(100).nullish(),
  email: z.string().email().nullish().or(z.literal('')),
  phone: z.string().max(20).nullish(),
  dateOfBirth: z.string().date().nullish(),
  gender: genderSchema.nullish(),
  bloodGroup: z.string().max(5).nullish(),
  address: z.string().nullish(),

  joiningDate: z.string().date(),
  confirmationDate: z.string().date().nullish(),
  status: employeeStatusSchema.optional(),
  employmentType: employmentTypeSchema.optional(),

  branchId: z.string().uuid().nullish(),
  departmentId: z.string().uuid().nullish(),
  designationId: z.string().uuid().nullish(),
  reportingToId: z.string().uuid().nullish(),

  pan: z.string().regex(panRegex, 'Invalid PAN').nullish().or(z.literal('')),
  aadhaar: z.string().regex(aadhaarRegex, 'Aadhaar must be 12 digits').nullish().or(z.literal('')),
  uan: z.string().length(12).nullish().or(z.literal('')),
  pfNumber: z.string().max(30).nullish(),
  esiNumber: z.string().max(20).nullish(),

  bankAccountNumber: z.string().max(30).nullish(),
  bankIfsc: z.string().regex(ifscRegex, 'Invalid IFSC').nullish().or(z.literal('')),
  bankName: z.string().max(100).nullish(),

  ctcAnnual: z.number().nonnegative().nullish(),

  agency: z.string().max(150).nullish(),
  dailyWageRate: z.number().nonnegative().nullish(),
  vendorId: z.string().uuid().nullish(),
});

export const updateEmployeeSchema = createEmployeeSchema.partial().extend({
  exitDate: z.string().date().nullish(),
});

export const employeeFilterSchema = z.object({
  search: z.string().optional(),
  status: employeeStatusSchema.optional(),
  departmentId: z.string().uuid().optional(),
  designationId: z.string().uuid().optional(),
  employmentType: employmentTypeSchema.optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(25),
});

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type EmployeeFilter = z.infer<typeof employeeFilterSchema>;
