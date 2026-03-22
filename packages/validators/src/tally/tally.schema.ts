import { z } from 'zod';

export const tallyExportFilterSchema = z.object({
  dateFrom: z.string().date(),
  dateTo: z.string().date(),
});

export type TallyExportFilter = z.infer<typeof tallyExportFilterSchema>;
