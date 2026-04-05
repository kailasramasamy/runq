import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { ApiSuccess } from '@runq/types';

const QUOTE_KEYS = {
  all: ['quotes'] as const,
  list: (filters?: Record<string, unknown>) => ['quotes', 'list', filters] as const,
  detail: (id: string) => ['quotes', 'detail', id] as const,
};

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'converted';

export interface QuoteLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface Quote {
  id: string;
  quoteNumber: string;
  customerId: string;
  customerName: string;
  quoteDate: string;
  expiryDate: string | null;
  status: QuoteStatus;
  lineItems: QuoteLineItem[];
  totalAmount: number;
  notes: string | null;
  terms: string | null;
  createdAt: string;
}

interface QuoteFilters {
  customerId?: string;
  status?: QuoteStatus;
  search?: string;
  page?: number;
  limit?: number;
  [key: string]: unknown;
}

export function useQuotes(filters?: QuoteFilters) {
  const params = new URLSearchParams();
  if (filters?.customerId) params.set('customerId', filters.customerId);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.search) params.set('search', filters.search);
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();

  return useQuery({
    queryKey: QUOTE_KEYS.list(filters),
    queryFn: () => api.get<ApiSuccess<Quote[]>>(`/ar/quotes${qs ? `?${qs}` : ''}`),
  });
}

export interface CreateQuoteInput {
  customerId: string;
  quoteDate: string;
  expiryDate?: string;
  lineItems: { description: string; quantity: number; unitPrice: number }[];
  notes?: string;
  terms?: string;
}

export function useCreateQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateQuoteInput) =>
      api.post<ApiSuccess<Quote>>('/ar/quotes', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUOTE_KEYS.all }),
  });
}

export function useConvertQuoteToInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<ApiSuccess<{ invoiceId: string }>>(`/ar/quotes/${id}/convert-to-invoice`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUOTE_KEYS.all }),
  });
}

export function useConvertQuoteToOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<ApiSuccess<{ orderId: string }>>(`/ar/quotes/${id}/convert-to-order`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUOTE_KEYS.all }),
  });
}
