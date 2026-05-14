import { z } from 'zod';

export const holidayTypeSchema = z.enum(['national', 'state', 'company', 'optional']);

export const createHolidaySchema = z.object({
  name: z.string().min(1).max(100),
  date: z.string().date(),
  type: holidayTypeSchema.default('company'),
  state: z.string().max(50).nullish(),
  isPaid: z.boolean().default(true),
});

export const updateHolidaySchema = createHolidaySchema.partial();

export type CreateHolidayInput = z.infer<typeof createHolidaySchema>;
export type UpdateHolidayInput = z.infer<typeof updateHolidaySchema>;
