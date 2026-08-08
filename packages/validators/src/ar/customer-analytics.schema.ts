import { z } from 'zod';

/**
 * Query for the per-customer sales analytics endpoint.
 *
 * `dateFrom`/`dateTo` follow the finance-module convention (see
 * `reportPeriodSchema`) and are required — the caller always knows the
 * window it is asking about, and defaulting server-side would hide which
 * period a number belongs to.
 *
 * `groupBy` buckets the revenue trend. It is interpolated into a
 * `date_trunc()` call, so keeping it a closed enum here is what makes that
 * safe.
 */
export const customerAnalyticsQuerySchema = z
  .object({
    dateFrom: z.string().date(),
    dateTo: z.string().date(),
    groupBy: z.enum(['day', 'week', 'month']).default('month'),
  })
  .refine((q) => q.dateFrom <= q.dateTo, {
    message: 'dateFrom must be on or before dateTo',
    path: ['dateFrom'],
  });

export type CustomerAnalyticsQuery = z.infer<typeof customerAnalyticsQuerySchema>;
