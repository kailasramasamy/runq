import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { ApiSuccess } from '@runq/types';

const QT_KEYS = {
  all: ['quick-templates'] as const,
  list: () => ['quick-templates', 'list'] as const,
  detail: (id: string) => ['quick-templates', 'detail', id] as const,
};

export interface QuickTemplateItem {
  itemId: string;
  description: string;
  hsnSacCode: string | null;
  unitPrice: number;
  taxRate: number | null;
  taxCategory: string | null;
  defaultQuantity: number;
}

export interface QuickInvoiceTemplate {
  id: string;
  customerId: string;
  customerName?: string;
  name: string;
  paymentTermsDays: number;
  notes: string | null;
  items: QuickTemplateItem[];
  isActive: boolean;
  createdAt: string;
}

export interface CreateQuickTemplateInput {
  customerId: string;
  name: string;
  paymentTermsDays: number;
  notes?: string;
  items: Array<{
    itemId: string;
    description: string;
    hsnSacCode?: string;
    unitPrice: number;
    taxRate?: number;
    taxCategory?: string;
    defaultQuantity: number;
  }>;
}

export interface GenerateFromTemplateInput {
  invoiceDate: string;
  quantities: Record<string, number>;
}

export function useQuickTemplates() {
  return useQuery({
    queryKey: QT_KEYS.list(),
    queryFn: () => api.get<ApiSuccess<QuickInvoiceTemplate[]>>('/ar/quick-templates'),
  });
}

export function useQuickTemplate(id: string) {
  return useQuery({
    queryKey: QT_KEYS.detail(id),
    queryFn: () => api.get<ApiSuccess<QuickInvoiceTemplate>>(`/ar/quick-templates/${id}`),
    enabled: !!id,
  });
}

export function useCreateQuickTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateQuickTemplateInput) =>
      api.post<ApiSuccess<QuickInvoiceTemplate>>('/ar/quick-templates', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: QT_KEYS.all }),
  });
}

export function useUpdateQuickTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateQuickTemplateInput> }) =>
      api.put<ApiSuccess<QuickInvoiceTemplate>>(`/ar/quick-templates/${id}`, data),
    onSuccess: (_res, { id }) => {
      qc.invalidateQueries({ queryKey: QT_KEYS.all });
      qc.invalidateQueries({ queryKey: QT_KEYS.detail(id) });
    },
  });
}

export function useDeleteQuickTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete<ApiSuccess<void>>(`/ar/quick-templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: QT_KEYS.all }),
  });
}

export function useGenerateFromTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: GenerateFromTemplateInput }) =>
      api.post<ApiSuccess<{ invoiceId: string; invoiceNumber: string; shareUrl?: string }>>(
        `/ar/quick-templates/${id}/generate`,
        data,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
  });
}
