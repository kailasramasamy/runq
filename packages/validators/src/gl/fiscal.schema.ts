import { z } from 'zod';

export const createFiscalPeriodSchema = z.object({
  name: z.string().min(1).max(50),
  startDate: z.string().date(),
  endDate: z.string().date(),
});

export const closeFiscalPeriodSchema = z.object({
  status: z.enum(['closed', 'locked']),
});

export type CreateFiscalPeriodInput = z.infer<typeof createFiscalPeriodSchema>;
export type CloseFiscalPeriodInput = z.infer<typeof closeFiscalPeriodSchema>;
