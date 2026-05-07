import { z } from 'zod';

export const billCategoryEnum = z.enum([
  'employee_salary',
  'delivery_boys',
  'farmers_suppliers',
  'rent_fixed',
  'general',
]);

export type BillCategory = z.infer<typeof billCategoryEnum>;

export const importBillsCSVSchema = z.object({
  csvData: z.string().min(1, 'CSV data required'),
  category: billCategoryEnum,
  // Optional period for salary-style imports — used to auto-fill missing
  // invoice_date, due_date, invoice_number, item_name when the CSV doesn't
  // carry them. month: 1-12, year: 4-digit.
  periodMonth: z.coerce.number().int().min(1).max(12).optional(),
  periodYear: z.coerce.number().int().min(2000).max(2100).optional(),
  // Per-row vendor overrides — keyed by row number (string). Used when the
  // user picks an explicit vendor in the preview step (matched, ambiguous
  // resolved, or just-created via inline create).
  vendorOverrides: z.record(z.string(), z.string().uuid()).optional(),
});

export const previewBillsCSVSchema = z.object({
  csvData: z.string().min(1, 'CSV data required'),
  category: billCategoryEnum,
  periodMonth: z.coerce.number().int().min(1).max(12).optional(),
  periodYear: z.coerce.number().int().min(2000).max(2100).optional(),
});

export type ImportBillsCSVInput = z.infer<typeof importBillsCSVSchema>;
export type PreviewBillsCSVInput = z.infer<typeof previewBillsCSVSchema>;
