import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { ImportBillsCSVInput, PreviewBillsCSVInput } from '@runq/validators';

interface ImportResult {
  created: number;
  errors: Array<{ row: number; vendorName: string; message: string }>;
}

export interface PreviewRow {
  rowNum: number;
  vendorName: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  itemName: string;
  amount: number;
  matchStatus: 'matched' | 'ambiguous' | 'not_found' | 'parse_error';
  vendorId?: string;
  matchedVendorName?: string;
  candidates: Array<{ id: string; name: string }>;
  parseError?: string;
}

interface PreviewResult {
  rows: PreviewRow[];
  headerErrors: string[];
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

export function usePreviewBillsCSV() {
  return useMutation({
    mutationFn: (data: PreviewBillsCSVInput) =>
      api.post<{ data: PreviewResult }>('/ap/purchase-invoices/import/preview', data),
  });
}
