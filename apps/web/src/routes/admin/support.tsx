/**
 * Platform-admin support inbox — triage escalated conversations across tenants.
 */
import { useEffect, useRef, useState } from 'react';
import { Send, Inbox, MessageSquare, CheckCircle2, X, Bot, User2, Loader2, TrendingUp, Clock, AlertTriangle, Wrench } from 'lucide-react';
import { PageHeader, Card, CardContent, Skeleton, Badge, Button } from '@/components/ui';
import {
  useAdminInbox,
  useAdminConversation,
  useAdminReply,
  useAdminClose,
  useAdminSupportStats,
  type AdminStats,
  type SupportOutcome,
} from '@/lib/support-api';
import { useAdminSupportRealtime } from '@/lib/support-realtime';
import { ChatMarkdown } from '@/components/support/chat-markdown';

const OUTCOME_LABEL: Record<SupportOutcome, string> = {
  awaiting_user: 'Awaiting user',
  awaiting_human: 'Needs your reply',
  in_progress: 'In progress',
  answered: 'Answered',
  resolved_by_human: 'Resolved (human)',
  resolved_by_user: 'Resolved (user)',
  auto_closed: 'Auto-closed',
  closed_by_admin: 'Closed',
};

const OUTCOME_BADGE: Record<SupportOutcome, { bg: string; text: string }> = {
  awaiting_user: { bg: 'bg-zinc-100 dark:bg-zinc-800', text: 'text-zinc-700 dark:text-zinc-300' },
  awaiting_human: { bg: 'bg-amber-100 dark:bg-amber-950/40', text: 'text-amber-800 dark:text-amber-200' },
  in_progress: { bg: 'bg-indigo-100 dark:bg-indigo-950/40', text: 'text-indigo-700 dark:text-indigo-300' },
  answered: { bg: 'bg-emerald-100 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-300' },
  resolved_by_human: { bg: 'bg-emerald-100 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-300' },
  resolved_by_user: { bg: 'bg-emerald-100 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-300' },
  auto_closed: { bg: 'bg-zinc-100 dark:bg-zinc-800', text: 'text-zinc-500 dark:text-zinc-400' },
  closed_by_admin: { bg: 'bg-zinc-100 dark:bg-zinc-800', text: 'text-zinc-500 dark:text-zinc-400' },
};

function OutcomeBadge({ outcome }: { outcome: SupportOutcome }) {
  const c = OUTCOME_BADGE[outcome];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${c.bg} ${c.text}`}>
      {OUTCOME_LABEL[outcome]}
    </span>
  );
}

type StatusFilter = 'all' | 'waiting_human' | 'agent_replied' | 'resolved' | 'closed';

const STATUS_LABEL: Record<StatusFilter, string> = {
  all: 'All',
  waiting_human: 'Waiting for human',
  agent_replied: 'Agent replied',
  resolved: 'Resolved',
  closed: 'Closed',
};

export function AdminSupportPage() {
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [activeId, setActiveId] = useState<string | null>(null);

  const inbox = useAdminInbox(filter);
  const stats = useAdminSupportStats();
  const conversations = inbox.data?.data?.conversations ?? [];
  const data = stats.data?.data;

  // Realtime — push events from server invalidate inbox, stats, and the
  // active conversation, so admin sees user replies the moment they arrive.
  useAdminSupportRealtime(activeId);

  return (
    <div className="space-y-5">
      <PageHeader title="Support" description="Triage, reply, and monitor agent performance" />

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Waiting for you"
          value={data?.kpis.waitingHuman ?? 0}
          icon={<AlertTriangle className="h-4 w-4" />}
          tone="amber"
          subtle="needs reply"
        />
        <KpiCard
          label="Today"
          value={data?.kpis.today ?? 0}
          icon={<TrendingUp className="h-4 w-4" />}
          tone="indigo"
          subtle={`${data?.kpis.last7Days ?? 0} this week`}
        />
        <KpiCard
          label="Escalation rate"
          value={`${data?.kpis.escalationRate ?? 0}%`}
          icon={<Bot className="h-4 w-4" />}
          tone="zinc"
          subtle="last 30 days"
        />
        <KpiCard
          label="Median resolution"
          value={formatDuration(data?.kpis.medianResolutionSeconds ?? 0)}
          icon={<Clock className="h-4 w-4" />}
          tone="emerald"
          subtle="created → closed"
        />
      </div>

      {/* Volume + Tools row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <VolumeChart data={data?.dailyVolume ?? []} loading={stats.isLoading} />
        <ToolsCard topTools={data?.topTools ?? []} modelSplit={data?.modelSplit ?? []} loading={stats.isLoading} />
      </div>

      {/* Filter pills with counts */}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(STATUS_LABEL) as StatusFilter[]).map((s) => {
          const counts = data?.statusCounts;
          const count = s === 'all'
            ? counts ? counts.open + counts.agent_replied + counts.waiting_human + counts.resolved + counts.closed : 0
            : counts?.[s] ?? 0;
          const active = filter === s;
          return (
            <button
              key={s}
              onClick={() => {
                setFilter(s);
                setActiveId(null);
              }}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition ${
                active
                  ? 'bg-indigo-600 text-white'
                  : 'border border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300'
              }`}
            >
              <span>{STATUS_LABEL[s]}</span>
              <span
                className={`min-w-[18px] rounded-full px-1.5 py-0 text-center text-[10px] font-semibold tabular-nums ${
                  active
                    ? 'bg-white/20 text-white'
                    : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Two-pane layout: list + detail */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[380px_1fr]">
        <Card className="overflow-hidden p-0">
          <div className="border-b border-zinc-200 px-3 py-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            <Inbox className="mr-1 inline h-3 w-3" /> {conversations.length} conversation{conversations.length === 1 ? '' : 's'}
          </div>
          {inbox.isLoading ? (
            <div className="space-y-2 p-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="p-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
              <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-500" />
              Nothing here. Inbox zero.
            </div>
          ) : (
            <div className="max-h-[calc(100vh-280px)] overflow-y-auto">
              {conversations.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveId(c.id)}
                  className={`block w-full border-b border-zinc-100 px-3 py-3 text-left transition hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50 ${
                    activeId === c.id ? 'bg-indigo-50 dark:bg-indigo-950/30' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {c.tenantName}
                      </div>
                      <div className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                        {c.userName} · {c.userEmail}
                      </div>
                      {c.preview && (
                        <div className="mt-1 line-clamp-2 text-xs text-zinc-600 dark:text-zinc-300">
                          {c.preview}
                        </div>
                      )}
                    </div>
                    <OutcomeBadge outcome={c.outcome} />
                  </div>
                  {c.agentSummary && (
                    <div className="mt-1.5 line-clamp-2 text-xs text-zinc-600 dark:text-zinc-400">
                      {c.agentSummary}
                    </div>
                  )}
                  <div className="mt-1 text-[10px] text-zinc-400 dark:text-zinc-500">
                    {timeAgo(c.lastMessageAt)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>

        {activeId ? (
          <ConversationPane
            conversationId={activeId}
            onClose={() => setActiveId(null)}
          />
        ) : (
          <Card>
            <CardContent>
              <div className="py-16 text-center text-sm text-zinc-500 dark:text-zinc-400">
                <MessageSquare className="mx-auto mb-3 h-10 w-10 text-zinc-300 dark:text-zinc-600" />
                Select a conversation to read and reply.
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

type Tone = 'amber' | 'indigo' | 'zinc' | 'emerald';

function KpiCard({
  label,
  value,
  icon,
  tone,
  subtle,
}: { label: string; value: string | number; icon: React.ReactNode; tone: Tone; subtle?: string }) {
  const colors: Record<Tone, string> = {
    amber: 'text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-950/30',
    indigo: 'text-indigo-700 bg-indigo-50 dark:text-indigo-300 dark:bg-indigo-950/30',
    zinc: 'text-zinc-700 bg-zinc-100 dark:text-zinc-300 dark:bg-zinc-800',
    emerald: 'text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/30',
  };
  return (
    <Card>
      <CardContent>
        <div className="flex items-start justify-between">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</div>
          <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${colors[tone]}`}>{icon}</div>
        </div>
        <div className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{value}</div>
        {subtle && <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{subtle}</div>}
      </CardContent>
    </Card>
  );
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '—';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}

function VolumeChart({ data, loading }: { data: AdminStats['dailyVolume']; loading: boolean }) {
  if (loading) {
    return (
      <Card>
        <CardContent>
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }
  const max = Math.max(1, ...data.map((d) => d.conversations));
  const totalConvs = data.reduce((s, d) => s + d.conversations, 0);
  const totalMsgs = data.reduce((s, d) => s + d.messages, 0);
  return (
    <Card>
      <CardContent>
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Volume — last 14 days</div>
            <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              {totalConvs} conversations · {totalMsgs} messages
            </div>
          </div>
        </div>
        <div className="mt-4 flex h-32 items-end gap-1">
          {data.map((d) => {
            const h = max > 0 ? Math.max(2, (d.conversations / max) * 100) : 0;
            const date = new Date(d.day);
            const day = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
            return (
              <div key={d.day} className="group flex flex-1 flex-col items-center justify-end" title={`${day}: ${d.conversations} conversations, ${d.messages} messages`}>
                <div
                  className="w-full rounded-t bg-indigo-500 transition group-hover:bg-indigo-600 dark:bg-indigo-500/80 dark:group-hover:bg-indigo-400"
                  style={{ height: `${h}%` }}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex justify-between text-[10px] text-zinc-400 dark:text-zinc-500">
          <span>{new Date(data[0]?.day ?? Date.now()).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
          <span>Today</span>
        </div>
      </CardContent>
    </Card>
  );
}

function ToolsCard({
  topTools,
  modelSplit,
  loading,
}: { topTools: AdminStats['topTools']; modelSplit: AdminStats['modelSplit']; loading: boolean }) {
  if (loading) {
    return (
      <Card>
        <CardContent>
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }
  const totalCalls = topTools.reduce((s, t) => s + t.calls, 0);
  const totalAgentMessages = modelSplit.reduce((s, m) => s + m.messages, 0);
  return (
    <Card>
      <CardContent>
        <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          <Wrench className="mr-1.5 inline h-3.5 w-3.5" /> Tool calls
        </div>
        <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">last 30 days · {totalCalls} total</div>
        <div className="mt-3 space-y-1.5">
          {topTools.length === 0 ? (
            <div className="text-xs text-zinc-500 dark:text-zinc-400">No tool calls yet.</div>
          ) : (
            topTools.slice(0, 6).map((t) => {
              const pct = totalCalls > 0 ? Math.round((t.calls / totalCalls) * 100) : 0;
              return (
                <div key={t.tool} className="text-xs">
                  <div className="flex items-baseline justify-between">
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">{t.tool.replace(/_/g, ' ')}</span>
                    <span className="text-zinc-500 dark:text-zinc-400">
                      {t.calls}
                      {t.failures > 0 && <span className="ml-1 text-red-600">({t.failures} failed)</span>}
                    </span>
                  </div>
                  <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-indigo-500 dark:bg-indigo-400"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {modelSplit.length > 0 && (
          <>
            <div className="mt-4 border-t border-zinc-200 pt-3 text-xs font-medium text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              Model usage
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {modelSplit.map((m) => {
                const pct = totalAgentMessages > 0 ? Math.round((m.messages / totalAgentMessages) * 100) : 0;
                return (
                  <Badge key={m.model} variant="default">
                    {m.model.replace('claude-', '')} · {pct}%
                  </Badge>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ConversationPane({ conversationId, onClose }: { conversationId: string; onClose: () => void }) {
  const detail = useAdminConversation(conversationId);
  const reply = useAdminReply();
  const close = useAdminClose();
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const data = detail.data?.data;
  const messageCount = data?.messages.length ?? 0;

  // Auto-scroll to bottom whenever a new message arrives or the active
  // conversation changes. Use rAF so the scroll runs after the messages
  // div has its final height — without this, switching conversations
  // sometimes leaves the scroll near the top because the effect fires
  // before the DOM finishes laying out the new content.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
    return () => cancelAnimationFrame(id);
  }, [messageCount, conversationId]);

  if (detail.isLoading || !data) {
    return (
      <Card><CardContent><Skeleton className="h-96 w-full" /></CardContent></Card>
    );
  }

  async function handleReply() {
    const trimmed = draft.trim();
    if (!trimmed || reply.isPending) return;
    setDraft('');
    reply.mutate({ id: conversationId, message: trimmed });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter inserts a newline
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleReply();
    }
  }

  return (
    <Card className="flex h-[calc(100vh-220px)] flex-col p-0">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
        <div>
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {data.conversation.tenantName} <span className="text-zinc-400">·</span>{' '}
              <span className="text-zinc-600 dark:text-zinc-400">{data.conversation.userEmail}</span>
            </div>
            <OutcomeBadge outcome={data.conversation.outcome} />
          </div>
          <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Started {timeAgo(data.conversation.createdAt)}
            {data.conversation.escalatedAt && ` · Escalated ${timeAgo(data.conversation.escalatedAt)}`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => close.mutate(conversationId)}
            disabled={close.isPending}
          >
            <CheckCircle2 className="mr-1 h-3 w-3" /> Close
          </Button>
          <button onClick={onClose} className="rounded p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {data.conversation.agentSummary && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-200">
          <strong>Agent's note:</strong> {data.conversation.agentSummary}
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {data.messages.map((m) => (
          <AdminMessageBubble key={m.id} message={m} />
        ))}
      </div>

      {/* Reply box */}
      <div className="border-t border-zinc-200 p-3 dark:border-zinc-700">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Reply as a human… (Enter to send, Shift+Enter for newline)"
          rows={3}
          className="w-full resize-none rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
        />
        <div className="mt-2 flex justify-end">
          <Button onClick={handleReply} disabled={!draft.trim() || reply.isPending}>
            {reply.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Send className="mr-1 h-3 w-3" />}
            Send reply
          </Button>
        </div>
      </div>
    </Card>
  );
}

function AdminMessageBubble({ message }: { message: { role: string; content: string; createdAt: string; model?: string | null } }) {
  const isUser = message.role === 'user';
  const isHuman = message.role === 'human';
  return (
    <div className={`flex gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          isHuman ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
        }`}>
          {isHuman ? <User2 className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
        </div>
      )}
      <div className="max-w-[78%]">
        <div className={`rounded-2xl px-3 py-2 text-sm ${
          isUser
            ? 'bg-indigo-600 text-white'
            : isHuman
              ? 'bg-emerald-50 text-zinc-900 dark:bg-emerald-950/30 dark:text-zinc-100'
              : 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
        }`}>
          <ChatMarkdown content={message.content} inverted={isUser} />
        </div>
        <div className="mt-0.5 text-[10px] text-zinc-400 dark:text-zinc-500">
          {message.role}
          {message.model && ` · ${message.model.replace('claude-', '')}`}
          {' · '}
          {timeAgo(message.createdAt)}
        </div>
      </div>
    </div>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
