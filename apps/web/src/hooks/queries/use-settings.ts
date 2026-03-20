import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { User } from '@runq/types';
import type { CompanySettingsInput, InvoiceNumberingInput } from '@runq/validators';

// ─── Keys ────────────────────────────────────────────────────────────────────

const SETTINGS_KEYS = {
  company: ['settings', 'company'] as const,
  invoiceNumbering: ['settings', 'invoice-numbering'] as const,
  users: ['settings', 'users'] as const,
};

// ─── Company Settings ────────────────────────────────────────────────────────

interface CompanySettings extends CompanySettingsInput {
  name: string;
}

export function useCompanySettings() {
  return useQuery({
    queryKey: SETTINGS_KEYS.company,
    queryFn: () => api.get<{ data: CompanySettings }>('/settings/company'),
  });
}

export function useUpdateCompanySettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CompanySettingsInput) =>
      api.put<{ data: CompanySettings }>('/settings/company', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: SETTINGS_KEYS.company }),
  });
}

// ─── Invoice Numbering ───────────────────────────────────────────────────────

export function useInvoiceNumbering() {
  return useQuery({
    queryKey: SETTINGS_KEYS.invoiceNumbering,
    queryFn: () => api.get<{ data: InvoiceNumberingInput }>('/settings/invoice-numbering'),
  });
}

export function useUpdateInvoiceNumbering() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: InvoiceNumberingInput) =>
      api.put<{ data: InvoiceNumberingInput }>('/settings/invoice-numbering', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: SETTINGS_KEYS.invoiceNumbering }),
  });
}

// ─── Users ───────────────────────────────────────────────────────────────────

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role: 'owner' | 'accountant' | 'viewer';
}

export interface UpdateUserInput {
  role?: 'owner' | 'accountant' | 'viewer';
  isActive?: boolean;
}

export function useUsers() {
  return useQuery({
    queryKey: SETTINGS_KEYS.users,
    queryFn: () => api.get<{ data: User[] }>('/settings/users'),
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateUserInput) => api.post<{ data: User }>('/settings/users', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: SETTINGS_KEYS.users }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateUserInput }) =>
      api.put<{ data: User }>(`/settings/users/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: SETTINGS_KEYS.users }),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ data: null }>(`/settings/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: SETTINGS_KEYS.users }),
  });
}
