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
 * /parse takes multipart files (so we hit fetch directly to attach the
 * Authorization header — the api-client wrapper only handles JSON bodies)
 * and returns the staged ParsedInvoice[]. /commit is a normal JSON POST
 * via the api-client.
 */
export function useParseInvoices() {
  return useMutation({
    mutationFn: async (vars: { files: File[]; format?: ImportFormat }) => {
      const fd = new FormData();
      for (const f of vars.files) fd.append('files', f);
      const url = `/api/v1/ar/invoice-imports${vars.format ? `?format=${vars.format}` : ''}`;
      const token = localStorage.getItem('runq-token');
      const res = await fetch(url, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Parse failed' }));
        throw new Error(err.message || err.error || `Parse failed (${res.status})`);
      }
      const json = (await res.json()) as ApiSuccess<ParseFilesResult>;
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
