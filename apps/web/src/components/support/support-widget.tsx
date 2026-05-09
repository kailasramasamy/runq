/**
 * Support chat — slide-in drawer (640px, right side) with two views:
 *   - List: recent conversations with status badges + "New conversation"
 *   - Chat: full thread + composer with back arrow to return to List
 *
 * Single entry point: the LifeBuoy FAB (or the `runq:open-support` event).
 * No sidebar entry, no separate page — everything lives here.
 */
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  LifeBuoy,
  X,
  Send,
  Loader2,
  Bot,
  User2,
  Plus,
  ArrowLeft,
  ThumbsUp,
  MessageSquare,
} from 'lucide-react';
import {
  useSupportConversation,
  useSupportConversations,
  useResolveConversation,
  streamSupportTurn,
  type SupportConversationSummary,
  type SupportMessage,
  type SupportOutcome,
  type SupportStreamEvent,
} from '@/lib/support-api';
import { ChatMarkdown } from './chat-markdown';
import { useSupportRealtime } from '@/lib/support-realtime';

const OUTCOME_LABEL: Record<SupportOutcome, string> = {
  awaiting_user: 'Reply when ready',
  awaiting_human: 'Team responding',
  in_progress: 'In progress',
  answered: 'Answered',
  resolved_by_human: 'Resolved by team',
  resolved_by_user: 'Resolved',
  auto_closed: 'Auto-closed',
  closed_by_admin: 'Closed',
};

const OUTCOME_BADGE: Record<SupportOutcome, string> = {
  awaiting_user: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300',
  awaiting_human: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200',
  in_progress: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  answered: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  resolved_by_human: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  resolved_by_user: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  auto_closed: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
  closed_by_admin: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
};

type View = 'list' | 'chat';

export function SupportWidget() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('list');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<string | null>(null);

  // ESC closes the drawer
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  // External event hook (e.g. "Open support" from another part of the app).
  // Optional `detail.message` prefills the composer in a fresh new conversation.
  useEffect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent<{ message?: string }>).detail;
      setOpen(true);
      if (detail?.message) {
        setActiveId(null);
        setView('chat');
        setPrefill(detail.message);
      }
    }
    window.addEventListener('runq:open-support', onOpen);
    return () => window.removeEventListener('runq:open-support', onOpen);
  }, []);

  function openConversation(id: string) {
    setActiveId(id);
    setView('chat');
  }

  function startNew() {
    setActiveId(null);
    setView('chat');
  }

  function backToList() {
    setView('list');
  }

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity duration-200 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={() => setOpen(false)}
      />

      <div
        className={`fixed right-0 top-0 z-50 flex h-full w-full flex-col bg-white shadow-2xl transition-transform duration-300 ease-out sm:w-[640px] dark:bg-zinc-900 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {view === 'list' ? (
          <ListView
            onClose={() => setOpen(false)}
            onSelect={openConversation}
            onNew={startNew}
          />
        ) : (
          <ChatView
            conversationId={activeId}
            onSetConversationId={setActiveId}
            onClose={() => setOpen(false)}
            onBack={backToList}
            prefill={prefill}
            onPrefillConsumed={() => setPrefill(null)}
          />
        )}
      </div>
    </>
  );
}

// ── List view ─────────────────────────────────────────────────────────

function ListView({
  onClose,
  onSelect,
  onNew,
}: { onClose: () => void; onSelect: (id: string) => void; onNew: () => void }) {
  const list = useSupportConversations();
  const conversations = list.data?.data ?? [];
  const open = conversations.filter(
    (c) => c.status === 'open' || c.status === 'agent_replied' || c.status === 'waiting_human',
  );
  const past = conversations.filter((c) => c.status === 'resolved' || c.status === 'closed');

  return (
    <>
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900">
            <LifeBuoy className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Support</div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">Your conversations with runQ</div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {conversations.length > 0 && (
        <div className="grid grid-cols-3 gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <MiniStat
            label="Open"
            value={open.length}
            tone="indigo"
          />
          <MiniStat
            label="Team replying"
            value={conversations.filter((c) => c.status === 'waiting_human').length}
            tone="amber"
          />
          <MiniStat
            label="Resolved"
            value={past.length}
            tone="emerald"
          />
        </div>
      )}

      <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
        <button
          onClick={onNew}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          New conversation
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {list.isLoading ? (
          <div className="space-y-2 p-4">
            <div className="h-14 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
            <div className="h-14 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/40">
              <Bot className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Hi, how can I help?</div>
            <div className="mt-1 max-w-xs text-xs text-zinc-500 dark:text-zinc-400">
              Ask about features, troubleshooting, billing — anything. Tap "New conversation" above to start.
            </div>
          </div>
        ) : (
          <>
            {open.length > 0 && (
              <div>
                <SectionLabel>Open</SectionLabel>
                {open.map((c) => (
                  <ListRow key={c.id} c={c} onClick={() => onSelect(c.id)} />
                ))}
              </div>
            )}
            {past.length > 0 && (
              <div>
                <SectionLabel>Past</SectionLabel>
                {past.map((c) => (
                  <ListRow key={c.id} c={c} onClick={() => onSelect(c.id)} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: { label: string; value: number; tone: 'indigo' | 'amber' | 'emerald' }) {
  const colors = {
    indigo: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300',
    amber: 'bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300',
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300',
  }[tone];
  return (
    <div className={`rounded-lg px-2.5 py-2 ${colors}`}>
      <div className="text-[10px] font-medium uppercase tracking-wide opacity-75">{label}</div>
      <div className="mt-0.5 text-lg font-semibold leading-tight tabular-nums">{value}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-zinc-50 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:bg-zinc-900/60 dark:text-zinc-400">
      {children}
    </div>
  );
}

function ListRow({
  c,
  onClick,
}: {
  c: SupportConversationSummary;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="block w-full border-b border-zinc-100 px-4 py-3 text-left transition hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {c.subject ?? c.preview ?? 'Support conversation'}
          </div>
          <div className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            {timeAgo(c.lastMessageAt)}
          </div>
        </div>
        {c.outcome && (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${OUTCOME_BADGE[c.outcome]}`}>
            {OUTCOME_LABEL[c.outcome]}
          </span>
        )}
      </div>
    </button>
  );
}

// ── Chat view ─────────────────────────────────────────────────────────

function ChatView({
  conversationId,
  onSetConversationId,
  onClose,
  onBack,
  prefill,
  onPrefillConsumed,
}: {
  conversationId: string | null;
  onSetConversationId: (id: string) => void;
  onClose: () => void;
  onBack: () => void;
  prefill?: string | null;
  onPrefillConsumed?: () => void;
}) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const qc = useQueryClient();
  const detail = useSupportConversation(conversationId);
  const resolve = useResolveConversation();
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [toolStatus, setToolStatus] = useState<string | null>(null);

  // Realtime — refetch when admin replies push through
  useSupportRealtime(conversationId);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [detail.data, streaming, streamingText]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [conversationId]);

  const messages: SupportMessage[] = detail.data?.data?.messages ?? [];
  const conversation = detail.data?.data?.conversation;

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;
    setDraft('');
    setStreaming(true);
    setStreamingText('');
    setToolStatus(null);

    let newConversationId = conversationId;
    try {
      await streamSupportTurn({
        conversationId,
        message: trimmed,
        onEvent: (event: SupportStreamEvent) => {
          if (event.type === 'conversation') {
            newConversationId = event.id;
            onSetConversationId(event.id);
          } else if (event.type === 'text_delta') {
            setStreamingText((prev) => prev + event.text);
          } else if (event.type === 'tool_use_start') {
            setToolStatus(prettyTool(event.toolName));
          } else if (event.type === 'tool_result') {
            setToolStatus(null);
          } else if (event.type === 'escalated') {
            setToolStatus('Handing off to the runQ team…');
          } else if (event.type === 'error') {
            setStreamingText((prev) => prev + `\n\n[Error: ${event.message}]`);
          }
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Send failed';
      setStreamingText(`[Error: ${msg}]`);
    } finally {
      setStreaming(false);
      setStreamingText('');
      setToolStatus(null);
      qc.invalidateQueries({ queryKey: ['support', 'conversations'] });
      qc.invalidateQueries({ queryKey: ['support', 'conversation', newConversationId] });
    }
  }

  function handleSend() { void sendMessage(draft); }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // Auto-send when the parent drawer prefilled a message (e.g. from Ask runQ AI).
  // Runs once per prefill — only on a fresh new-conversation view.
  useEffect(() => {
    if (!prefill || conversationId || streaming) return;
    onPrefillConsumed?.();
    void sendMessage(prefill);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill, conversationId]);

  return (
    <>
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
        <div className="flex min-w-0 items-center gap-2">
          <button
            onClick={onBack}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            aria-label="Back to list"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {conversation?.subject
                ?? messages.find((m) => m.role === 'user')?.content
                ?? (conversationId ? 'Support' : 'New conversation')}
            </div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              {conversation?.status === 'waiting_human'
                ? 'A team member will reply soon'
                : 'Usually replies in seconds'}
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {!conversationId && messages.length === 0 && <NewConversationHint />}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        {streaming && (streamingText || toolStatus) && (
          <div className="flex gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
              <Bot className="h-3.5 w-3.5" />
            </div>
            <div className="max-w-[80%] rounded-2xl bg-zinc-100 px-3 py-2 text-sm text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
              {streamingText ? (
                <>
                  <ChatMarkdown content={streamingText} />
                  <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-indigo-500 align-middle" />
                </>
              ) : (
                <span className="text-xs italic text-zinc-500 dark:text-zinc-400">{toolStatus}</span>
              )}
            </div>
          </div>
        )}
        {streaming && !streamingText && !toolStatus && (
          <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            <Loader2 className="h-3 w-3 animate-spin" />
            Thinking…
          </div>
        )}
        {conversation?.status === 'waiting_human' && (
          <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            A team member has been notified and will reply within an hour.
            You can keep typing — your messages are saved.
          </div>
        )}
        {conversation?.status === 'agent_replied' && messages.length >= 2 && !streaming && (
          <div className="flex justify-center pt-1">
            <button
              onClick={async () => {
                if (!conversationId) return;
                await resolve.mutateAsync(conversationId);
                qc.invalidateQueries({ queryKey: ['support'] });
              }}
              disabled={resolve.isPending}
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-900 dark:bg-zinc-800 dark:text-emerald-300 dark:hover:bg-zinc-700"
            >
              <ThumbsUp className="h-3 w-3" />
              That answered my question
            </button>
          </div>
        )}
        {conversation?.status === 'resolved' && (
          <div className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
            Marked as resolved. Type to re-open if you need more help.
          </div>
        )}
      </div>

      <div className="border-t border-zinc-200 p-3 dark:border-zinc-700">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={conversationId ? 'Reply…' : 'Ask anything about runQ…'}
            rows={1}
            disabled={streaming}
            className="max-h-32 min-h-[40px] flex-1 resize-none rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
          <button
            onClick={handleSend}
            disabled={!draft.trim() || streaming}
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600 text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send"
          >
            {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
        <div className="mt-1 text-[10px] text-zinc-400 dark:text-zinc-500">
          Press Enter to send · Shift+Enter for newline · Esc to close
        </div>
      </div>
    </>
  );
}

function MessageBubble({ message }: { message: SupportMessage }) {
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
      <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
        isUser
          ? 'bg-indigo-600 text-white'
          : isHuman
            ? 'bg-emerald-50 text-zinc-900 dark:bg-emerald-950/30 dark:text-zinc-100'
            : 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
      }`}>
        <ChatMarkdown content={message.content} inverted={isUser} />
      </div>
    </div>
  );
}

function NewConversationHint() {
  const examples = [
    'How do I file GSTR-1?',
    'Why is my invoice still in draft?',
    'How do I reconcile a bank statement?',
  ];
  return (
    <div className="space-y-3 py-4">
      <div className="text-center">
        <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/40">
          <MessageSquare className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Start a new conversation</div>
        <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Try one of these or type your own:</div>
      </div>
      <div className="space-y-1.5">
        {examples.map((q) => (
          <div
            key={q}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
          >
            {q}
          </div>
        ))}
      </div>
    </div>
  );
}

function prettyTool(name: string): string {
  const map: Record<string, string> = {
    get_user_context: 'Looking up your account…',
    search_docs: 'Searching docs…',
    list_recent_invoices: 'Checking your invoices…',
    get_gst_status: 'Checking GST status…',
    get_pay_run_status: 'Checking pay runs…',
    lookup_recent_errors: 'Checking recent errors…',
    escalate_to_human: 'Handing off to the runQ team…',
  };
  return map[name] ?? `Running ${name}…`;
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
