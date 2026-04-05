import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { ApiSuccess } from '@runq/types';

interface EmailProviderConfig {
  emailProvider: 'resend' | 'sendgrid' | 'smtp' | null;
  emailConfig?: {
    apiKey?: string;
    smtpHost?: string;
    smtpPort?: number;
    smtpSecure?: boolean;
    smtpUser?: string;
    smtpPass?: string;
    fromEmail?: string;
    fromName?: string;
  };
}

const KEYS = {
  config: ['settings', 'email-provider'] as const,
};

export function useEmailProviderConfig() {
  return useQuery({
    queryKey: KEYS.config,
    queryFn: () => api.get<ApiSuccess<EmailProviderConfig>>('/settings/email-provider'),
  });
}

export function useUpdateEmailProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: EmailProviderConfig) =>
      api.put<ApiSuccess<EmailProviderConfig>>('/settings/email-provider', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.config }),
  });
}

export function useSendTestEmail() {
  return useMutation({
    mutationFn: (to: string) =>
      api.post<{ success: boolean; message: string }>('/settings/email-provider/test', { to }),
  });
}
