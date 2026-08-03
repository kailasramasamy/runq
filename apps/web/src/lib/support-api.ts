import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api-client';


// ── Types ────────────────────────────────────────────────────────────

export interface SupportConversationSummary {
  id: string;
  subject: string | null;
  status: 'open' | 'agent_replied' | 'waiting_human' | 'resolved' | 'closed';
  lastMessageAt: string;
  createdAt: string;
  escalatedAt?: string | null;
  resolvedAt?: string | null;
  assignedTo?: string | null;
  outcome?: SupportOutcome;
  preview?: string | null;
}

export interface SupportMessage {
  id: string;
  role: 'user' | 'agent' | 'human';
  content: string;
  createdAt: string;
}

export interface SupportConversationDetail {
  conversation: SupportConversationSummary & {
    userId: string;
    tenantId: string;
    agentSummary: string | null;
    escalatedAt: string | null;
    assignedTo: string | null;
  };
  messages: SupportMessage[];
}

export interface SupportTurnResult {
  reply: string;
  escalated: boolean;
  modelUsed: string;
  toolCallCount: number;
}

export type SupportOutcome =
  | 'awaiting_user'
  | 'awaiting_human'
  | 'in_progress'
  | 'answered'
  | 'resolved_by_human'
  | 'resolved_by_user'
  | 'auto_closed'
  | 'closed_by_admin';

export interface AdminInboxItem {
  id: string;
  subject: string | null;
  status: string;
  lastMessageAt: string;
  createdAt: string;
  escalatedAt: string | null;
  resolvedAt: string | null;
  assignedTo: string | null;
  agentSummary: string | null;
  outcome: SupportOutcome;
  tenantName: string;
  tenantSlug: string;
  userEmail: string;
  userName: string;
  preview?: string | null;
}

export interface AdminInboxResponse {
  conversations: AdminInboxItem[];
  counts: { waiting: number; open: number; replied: number };
}

export interface AdminConversationDetail {
  conversation: SupportConversationDetail['conversation'] & {
    tenantName: string;
    tenantSlug: string;
    userEmail: string;
    userName: string;
    outcome: SupportOutcome;
  };
  messages: Array<SupportMessage & { model?: string | null }>;
}

// ── Hooks ────────────────────────────────────────────────────────────

export function useSupportConversations() {
  return useQuery({
    queryKey: ['support', 'conversations'],
    queryFn: () => api.get<{ data: SupportConversationSummary[] }>('/support/conversations'),
  });
}

export function useSupportConversation(id: string | null) {
  return useQuery({
    queryKey: ['support', 'conversation', id],
    queryFn: () => api.get<{ data: SupportConversationDetail }>(`/support/conversations/${id}`),
    enabled: !!id,
  });
}

export function useStartConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { message: string; subject?: string }) =>
      api.post<{ data: SupportTurnResult & { conversationId: string } }>(
        '/support/conversations',
        input,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['support', 'conversations'] });
    },
  });
}

export function useSendMessage(conversationId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (message: string) =>
      api.post<{ data: SupportTurnResult | { queued: boolean; message: string } }>(
        `/support/conversations/${conversationId}/messages`,
        { message },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['support', 'conversation', conversationId] });
      qc.invalidateQueries({ queryKey: ['support', 'conversations'] });
    },
  });
}

export function useResolveConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/support/conversations/${id}/resolve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['support'] });
    },
  });
}

// ── Streaming ────────────────────────────────────────────────────────

export type SupportStreamEvent =
  | { type: 'conversation'; id: string }
  | { type: 'text_delta'; text: string }
  | { type: 'tool_use_start'; toolName: string }
  | { type: 'tool_result'; toolName: string; ok: boolean }
  | { type: 'escalated'; summary?: string }
  | { type: 'done'; result: SupportTurnResult }
  | { type: 'error'; message: string };

export async function streamSupportTurn(opts: {
  conversationId: string | null;
  message: string;
  onEvent: (event: SupportStreamEvent) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const path = opts.conversationId
    ? `/api/v1/support/conversations/${opts.conversationId}/stream`
    : '/api/v1/support/conversations/stream';

  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...api.authHeaders() },
    body: JSON.stringify({ message: opts.message }),
    signal: opts.signal,
  });

  if (!res.ok) {
    throw new Error((await res.text()) || `Request failed: ${res.status}`);
  }
  if (!res.body) throw new Error('No response body');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // SSE messages end with \n\n; split on that
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';
    for (const chunk of parts) {
      const dataLine = chunk.split('\n').find((l) => l.startsWith('data: '));
      if (!dataLine) continue;
      try {
        const event = JSON.parse(dataLine.slice(6)) as SupportStreamEvent;
        opts.onEvent(event);
      } catch {
        // ignore malformed
      }
    }
  }
}

// ── Admin ────────────────────────────────────────────────────────────

export interface AdminStats {
  kpis: {
    today: number;
    last7Days: number;
    last30Days: number;
    totalActive: number;
    waitingHuman: number;
    totalResolved: number;
    escalationRate: number;
    medianResolutionSeconds: number;
  };
  statusCounts: {
    open: number;
    agent_replied: number;
    waiting_human: number;
    resolved: number;
    closed: number;
  };
  dailyVolume: Array<{ day: string; conversations: number; messages: number }>;
  topTools: Array<{ tool: string; calls: number; failures: number; avgDurationMs: number }>;
  modelSplit: Array<{ model: string; messages: number }>;
  recentEscalations: Array<{
    id: string;
    subject: string | null;
    escalatedAt: string;
    agentSummary: string | null;
    status: string;
    tenantName: string;
    userEmail: string;
  }>;
}

export function useAdminSupportStats() {
  return useQuery({
    queryKey: ['support', 'admin', 'stats'],
    queryFn: () => api.get<{ data: AdminStats }>('/admin/support/stats'),
    refetchInterval: 60_000,
  });
}

export function useAdminInbox(status: 'all' | 'waiting_human' | 'open' | 'agent_replied' | 'resolved' | 'closed' = 'all') {
  return useQuery({
    queryKey: ['support', 'admin', 'inbox', status],
    queryFn: () =>
      api.get<{ data: AdminInboxResponse }>(`/admin/support/inbox?status=${status}`),
  });
}

export function useAdminConversation(id: string | null) {
  return useQuery({
    queryKey: ['support', 'admin', 'conversation', id],
    queryFn: () =>
      api.get<{ data: AdminConversationDetail }>(`/admin/support/conversations/${id}`),
    enabled: !!id,
  });
}

export function useAdminReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; message: string }) =>
      api.post(`/admin/support/conversations/${input.id}/reply`, { message: input.message }),
    onMutate: async (vars) => {
      // Optimistic insert so the admin sees their own reply immediately.
      const key = ['support', 'admin', 'conversation', vars.id];
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<{ data: AdminConversationDetail }>(key);
      if (previous) {
        const optimistic: AdminConversationDetail['messages'][number] = {
          id: `optimistic-${Date.now()}`,
          role: 'human',
          content: vars.message,
          createdAt: new Date().toISOString(),
        };
        qc.setQueryData(key, {
          ...previous,
          data: { ...previous.data, messages: [...previous.data.messages, optimistic] },
        });
      }
      return { previous };
    },
    onError: (_err, vars, ctx) => {
      // Roll back on failure
      if (ctx?.previous) {
        qc.setQueryData(['support', 'admin', 'conversation', vars.id], ctx.previous);
      }
    },
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: ['support', 'admin', 'conversation', vars.id] });
      qc.invalidateQueries({ queryKey: ['support', 'admin', 'inbox'] });
    },
  });
}

export function useAdminClose() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/admin/support/conversations/${id}/close`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['support', 'admin'] }),
  });
}
