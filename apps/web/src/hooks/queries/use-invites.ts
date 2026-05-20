import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';

// ─── Types ───────────────────────────────────────────────────────────────────

export type InviteType = 'new_tenant' | 'join_tenant';
export type InviteRole = 'accountant' | 'viewer';
export type InviteStatus = 'pending' | 'accepted' | 'expired';

export interface Invite {
  id: string;
  token: string;
  inviteType: InviteType;
  role: InviteRole;
  email: string | null;
  companyName: string | null;
  note: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
  invitingUserName: string;
  status: InviteStatus;
}

export interface CreateInviteInput {
  inviteType: InviteType;
  role?: InviteRole;
  email?: string;
  companyName?: string;
  note?: string;
  sendEmail?: boolean;
}

export interface CreateInviteResult {
  token: string;
  inviteType: InviteType;
  role: InviteRole;
  expiresAt: string;
  email: string | null;
  companyName: string | null;
  note: string | null;
  emailDelivery?: 'sent' | 'failed' | 'skipped';
}

// ─── Link helper ─────────────────────────────────────────────────────────────

// The public accept page lives at /signup/invite/:token, under the SPA base.
export function inviteLinkFor(token: string): string {
  const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
  return `${window.location.origin}${base}/signup/invite/${token}`;
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

const INVITES_KEY = ['invites'] as const;

export function useInvites() {
  return useQuery({
    queryKey: INVITES_KEY,
    queryFn: () => api.get<{ data: Invite[] }>('/auth/invites'),
  });
}

export function useCreateInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateInviteInput) =>
      api.post<{ data: CreateInviteResult }>('/auth/invites', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: INVITES_KEY }),
  });
}

export function useRevokeInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ data: null }>(`/auth/invites/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: INVITES_KEY }),
  });
}
