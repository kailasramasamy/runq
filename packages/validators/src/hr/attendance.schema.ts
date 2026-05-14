import { z } from 'zod';

export const attendanceStatusSchema = z.enum([
  'present', 'absent', 'half_day', 'leave', 'holiday', 'week_off',
]);
export const attendanceSourceSchema = z.enum(['manual', 'biometric', 'mobile', 'import']);

const timeOfDay = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

export const upsertAttendanceSchema = z.object({
  employeeId: z.string().uuid(),
  date: z.string().date(),
  shiftId: z.string().uuid().nullish(),
  checkIn: z.string().regex(timeOfDay).nullish().or(z.literal('')),
  checkOut: z.string().regex(timeOfDay).nullish().or(z.literal('')),
  hoursWorked: z.number().nonnegative().nullish(),
  otHours: z.number().nonnegative().nullish(),
  status: attendanceStatusSchema.default('present'),
  source: attendanceSourceSchema.default('manual'),
  notes: z.string().nullish(),
});

export const bulkAttendanceSchema = z.object({
  records: z.array(upsertAttendanceSchema).min(1).max(1000),
});

export const attendanceFilterSchema = z.object({
  employeeId: z.string().uuid().optional(),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
  status: attendanceStatusSchema.optional(),
});

export const biometricImportSchema = z.object({
  fileName: z.string().min(1).max(255),
  deviceType: z.string().max(50).nullish(),
  records: z.array(z.object({
    employeeCode: z.string().min(1),
    date: z.string().date(),
    checkIn: z.string().regex(timeOfDay).nullish(),
    checkOut: z.string().regex(timeOfDay).nullish(),
  })).min(1).max(10000),
});

export type UpsertAttendanceInput = z.infer<typeof upsertAttendanceSchema>;
export type BulkAttendanceInput = z.infer<typeof bulkAttendanceSchema>;
export type AttendanceFilter = z.infer<typeof attendanceFilterSchema>;
export type BiometricImportInput = z.infer<typeof biometricImportSchema>;
