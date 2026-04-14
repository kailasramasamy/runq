import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { ImportBillsCSVInput } from '@runq/validators';

interface ImportResult {
  created: number;
  errors: Array<{ row: number; vendorName: string; message: string }>;
}

export function useImportBillsCSV() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ImportBillsCSVInput) =>
      api.post<{ data: ImportResult }>('/ap/purchase-invoices/import', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-invoices'] });
    },
  });
}
