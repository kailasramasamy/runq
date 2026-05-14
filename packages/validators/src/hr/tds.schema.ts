import { z } from 'zod';

/** Capture the CIN after a monthly TDS challan (ITNS-281) is paid. */
export const recordTdsDepositSchema = z.object({
  bsrCode: z.string().regex(/^\d{7}$/, 'BSR code must be 7 digits'),
  challanSerialNo: z.string().regex(/^\d{1,10}$/, 'Challan serial number must be numeric'),
  depositDate: z.string().date(),
  paymentMode: z.string().max(30).nullish(),
  bankRef: z.string().max(50).nullish(),
  interestAmount: z.number().nonnegative().default(0),
  lateFeeAmount: z.number().nonnegative().default(0),
  notes: z.string().max(500).nullish(),
});

/** Quarter selector for Form 24Q generation / lookup. */
export const tds24QQuerySchema = z.object({
  financialYear: z.string().regex(/^\d{4}-\d{2}$/, 'FY must be like 2026-27'),
  quarter: z.coerce.number().int().min(1).max(4),
});

/** Record the token/RRR after the RPU file is filed on TRACES. */
export const fileTdsReturnSchema = z.object({
  token: z.string().min(1).max(50),
  notes: z.string().max(500).nullish(),
});

/** Financial-year selector for Form 16 Part B generation. */
export const tdsFinancialYearQuerySchema = z.object({
  financialYear: z.string().regex(/^\d{4}-\d{2}$/, 'FY must be like 2026-27'),
});

export type RecordTdsDepositInput = z.infer<typeof recordTdsDepositSchema>;
export type Tds24QQuery = z.infer<typeof tds24QQuerySchema>;
export type FileTdsReturnInput = z.infer<typeof fileTdsReturnSchema>;
export type TdsFinancialYearQuery = z.infer<typeof tdsFinancialYearQuerySchema>;
