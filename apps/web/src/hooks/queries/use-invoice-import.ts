import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type {
  ApiSuccess,
  CommitImportResult,
  ImportFormat,
  ParseFilesResult,
  ParsedInvoice,
} from '@runq/types';

const ALIAS_KEYS = {
  all: ['invoice-import-aliases'] as const,
};

export interface ItemAlias {
  id: string;
  sourceName: string;
  itemId: string;
  itemName: string;
  itemSku: string | null;
  itemUnit: string | null;
  createdAt: string;
}

export interface CustomerAlias {
  id: string;
  sourceKey: string;
  customerId: string;
  customerName: string;
  createdAt: string;
}

export function useImportAliases() {
  return useQuery({
    queryKey: ALIAS_KEYS.all,
    queryFn: () =>
      api.get<ApiSuccess<{ items: ItemAlias[]; customers: CustomerAlias[] }>>(
        '/ar/invoice-imports/aliases',
      ),
  });
}

export function useDeleteItemAlias() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete<ApiSuccess<null>>(`/ar/invoice-imports/aliases/items/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ALIAS_KEYS.all }),
  });
}

export function useChangeItemAlias() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ aliasId, newItemId }: { aliasId: string; newItemId: string }) =>
      api.put<ApiSuccess<{ aliasUpdated: boolean; invoiceLinesUpdated: number }>>(
        `/ar/invoice-imports/aliases/items/${aliasId}`,
        { newItemId },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ALIAS_KEYS.all }),
  });
}

export function useDeleteCustomerAlias() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete<ApiSuccess<null>>(`/ar/invoice-imports/aliases/customers/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ALIAS_KEYS.all }),
  });
}

/**
 * Hooks for the invoice import feature.
 *
 * /parse takes multipart files (api.upload) and returns the staged
 * ParsedInvoice[]. /commit is a normal JSON POST.
 */
export function useParseInvoices() {
  return useMutation({
    mutationFn: async (vars: { files: File[]; format?: ImportFormat }) => {
      const fd = new FormData();
      for (const f of vars.files) fd.append('files', f);
      const url = `/ar/invoice-imports${vars.format ? `?format=${vars.format}` : ''}`;
      const json = await api.upload<ApiSuccess<ParseFilesResult>>(url, fd);
      return json.data;
    },
  });
}

export interface CommitInvoiceImportInput {
  invoices: ParsedInvoice[];
  defaultStatus?: 'draft' | 'sent';
  persistAliases?: boolean;
}

export function useCommitInvoiceImport() {
  return useMutation({
    mutationFn: (input: CommitInvoiceImportInput) =>
      api.post<ApiSuccess<CommitImportResult>>('/ar/invoice-imports/commit', input),
  });
}
