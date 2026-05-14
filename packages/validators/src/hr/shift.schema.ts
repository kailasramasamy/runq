import { z } from 'zod';

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

export const createShiftSchema = z.object({
  name: z.string().min(1).max(50),
  startTime: z.string().regex(timeRegex, 'HH:MM'),
  endTime: z.string().regex(timeRegex, 'HH:MM'),
  breakMinutes: z.number().int().min(0).max(480).default(0),
  weeklyOffDays: z.array(z.number().int().min(0).max(6)).default([0]),
  isNightShift: z.boolean().default(false),
  isActive: z.boolean().optional(),
});

export const updateShiftSchema = createShiftSchema.partial();

export const assignShiftSchema = z.object({
  employeeId: z.string().uuid(),
  shiftId: z.string().uuid(),
  effectiveFrom: z.string().date(),
  effectiveTo: z.string().date().nullish(),
});

export type CreateShiftInput = z.infer<typeof createShiftSchema>;
export type UpdateShiftInput = z.infer<typeof updateShiftSchema>;
export type AssignShiftInput = z.infer<typeof assignShiftSchema>;
