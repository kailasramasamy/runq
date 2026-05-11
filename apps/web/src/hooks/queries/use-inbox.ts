import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { ApiSuccess } from '@runq/types';

export type InboxGroupKey =
  | 'invoices_to_send'
  | 'bills_to_approve'
  | 'bills_pending_match'
  | 'po_drafts_to_review'
  | 'expenses_to_approve'
  | 'expenses_to_reimburse';

export type InboxItemStatus = 'draft' | 'ready' | 'needs_review' | 'approved';

export interface InboxItem {
  id: string;
  href: string;
  title: string;
  subtitle: string;
  amount: number | null;
  date: string;
  status: InboxItemStatus;
}

export interface InboxGroup {
  key: InboxGroupKey;
  title: string;
  caption: string;
  count: number;
  items: InboxItem[];
}

export interface InboxPayload {
  totalCount: number;
  groups: InboxGroup[];
}

export const INBOX_KEYS = {
  count: ['inbox', 'count'] as const,
  list: ['inbox', 'list'] as const,
};

/**
 * Lightweight badge query for the sidebar — polls every 30s so the count
 * stays roughly fresh without hammering the API. Mutations elsewhere
 * (send invoice, approve bill, etc.) should also invalidate this key
 * for instant updates.
 */
export function useInboxCount() {
  return useQuery({
    queryKey: INBOX_KEYS.count,
    queryFn: () => api.get<ApiSuccess<{ count: number }>>('/inbox/count'),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

/** Full grouped payload for the inbox page. */
export function useInbox() {
  return useQuery({
    queryKey: INBOX_KEYS.list,
    queryFn: () => api.get<ApiSuccess<InboxPayload>>('/inbox'),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
