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
});

export type ImportBillsCSVInput = z.infer<typeof importBillsCSVSchema>;
