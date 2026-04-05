import { z } from 'zod';

export const reportPeriodSchema = z.object({
  dateFrom: z.string().date(),
  dateTo: z.string().date(),
});

export const balanceSheetQuerySchema = z.object({
  asOfDate: z.string().date().optional(),
});

export const comparisonQuerySchema = z.object({
  type: z.enum(['mom', 'yoy', 'budget_vs_actual']),
  dateFrom: z.string().date(),
  dateTo: z.string().date(),
});

export const forecastQuerySchema = z.object({
  days: z.coerce.number().int().min(30).max(365).default(90),
});

export type ReportPeriodInput = z.infer<typeof reportPeriodSchema>;
export type BalanceSheetQuery = z.infer<typeof balanceSheetQuerySchema>;
export type ComparisonQuery = z.infer<typeof comparisonQuerySchema>;
export type ForecastQuery = z.infer<typeof forecastQuerySchema>;
