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

export const bulkCreateHolidaysSchema = z.object({
  holidays: z.array(createHolidaySchema).min(1).max(60),
});

export const suggestHolidaysSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  state: z.string().trim().max(50).optional(),
});

export type CreateHolidayInput = z.infer<typeof createHolidaySchema>;
export type UpdateHolidayInput = z.infer<typeof updateHolidaySchema>;
export type BulkCreateHolidaysInput = z.infer<typeof bulkCreateHolidaysSchema>;
export type SuggestHolidaysInput = z.infer<typeof suggestHolidaysSchema>;
