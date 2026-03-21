import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { Customer, CustomerWithOutstanding, PaginatedResponse, ApiSuccess } from '@runq/types';
import type { CreateCustomerInput, UpdateCustomerInput, SyncCustomersInput } from '@runq/validators';

const CUSTOMER_KEYS = {
  all: ['customers'] as const,
  list: (filters?: Record<string, unknown>) => ['customers', 'list', filters] as const,
  detail: (id: string) => ['customers', 'detail', id] as const,
};

interface CustomerFilters {
  search?: string;
  type?: 'b2b' | 'payment_gateway';
  page?: number;
  limit?: number;
  [key: string]: unknown;
}

export function useCustomers(filters?: CustomerFilters) {
  const params = new URLSearchParams();
  if (filters?.search) params.set('search', filters.search);
  if (filters?.type) params.set('type', filters.type);
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();

  return useQuery({
    queryKey: CUSTOMER_KEYS.list(filters),
    queryFn: () =>
      api.get<PaginatedResponse<CustomerWithOutstanding>>(`/ar/customers${qs ? `?${qs}` : ''}`),
  });
}

export function useCustomer(id: string) {
  return useQuery({
    queryKey: CUSTOMER_KEYS.detail(id),
    queryFn: () => api.get<ApiSuccess<CustomerWithOutstanding>>(`/ar/customers/${id}`),
    enabled: !!id,
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateCustomerInput) =>
      api.post<ApiSuccess<Customer>>('/ar/customers', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: CUSTOMER_KEYS.all }),
  });
}

export function useUpdateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateCustomerInput }) =>
      api.put<ApiSuccess<Customer>>(`/ar/customers/${id}`, data),
    onSuccess: (_res, { id }) => {
      qc.invalidateQueries({ queryKey: CUSTOMER_KEYS.all });
      qc.invalidateQueries({ queryKey: CUSTOMER_KEYS.detail(id) });
    },
  });
}

export function useDeleteCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<ApiSuccess<null>>(`/ar/customers/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: CUSTOMER_KEYS.all }),
  });
}

interface SyncCustomersResult {
  created: number;
  updated: number;
  errors: Array<{ index: number; name: string; message: string }>;
}

interface ImportCustomersCSVResult {
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; name: string; message: string }>;
}

export function useSyncCustomers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: SyncCustomersInput) =>
      api.post<ApiSuccess<SyncCustomersResult>>('/ar/customers/sync', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: CUSTOMER_KEYS.all }),
  });
}

export function useImportCustomersCSV() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { csvData: string }) =>
      api.post<ApiSuccess<ImportCustomersCSVResult>>('/ar/customers/import', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: CUSTOMER_KEYS.all }),
  });
}
