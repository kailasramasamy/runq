import { useEffect, useMemo, useRef, useState } from 'react';
import {
  LifeBuoy, X, Send, Wallet, Plane, Clock, Receipt, Monitor, Smartphone, FileText, HelpCircle,
  AlertTriangle, CheckCircle2, Loader2, Lock, Inbox, Sparkles,
} from 'lucide-react';
import {
  PageHeader, Badge, Button, Select, Textarea, Input, Card, CardContent, CardFooter,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, useToast, Combobox,
} from '@/components/ui';
import { EmptyState } from '@/components/ar/primitives';
import {
  useTickets, useTicket, useUpdateTicket, useAddTicketComment,
  useAgentSettings, useUpdateAgentSettings, useAgentOperators,
  useAcceptAgentDraft, useDiscardAgentDraft,
} from '@/hooks/queries/use-hr-phase-next';
import type { HrTicket, TicketCategory, TicketStatus, TicketPriority, HelpdeskAgentSettings } from '@/hooks/queries/use-hr-phase-next';
import { useAuth, useIsReadOnly } from '@/providers/auth-provider';
import { ChatMarkdown } from '@/components/support/chat-markdown';
import { useHrHelpdeskRealtime } from '@/lib/hr-helpdesk-realtime';

// ─── Category / status / priority lookups ──────────────────────────────────

const CATEGORY_META: Record<TicketCategory, { label: string; icon: any; color: string; bg: string }> = {
  payroll:       { label: 'Payroll',       icon: Wallet,     color: 'text-teal-600 dark:text-teal-300',           bg: 'bg-teal-50 dark:bg-teal-900/30' },
  leave:         { label: 'Leave',         icon: Plane,      color: 'text-indigo-600 dark:text-indigo-300',       bg: 'bg-indigo-50 dark:bg-indigo-900/30' },
  attendance:    { label: 'Attendance',    icon: Clock,      color: 'text-orange-600 dark:text-orange-300',       bg: 'bg-orange-50 dark:bg-orange-900/30' },
  reimbursement: { label: 'Reimbursement', icon: Receipt,    color: 'text-purple-600 dark:text-purple-300',       bg: 'bg-purple-50 dark:bg-purple-900/30' },
  asset:         { label: 'Asset',         icon: Smartphone, color: 'text-amber-700 dark:text-amber-300',         bg: 'bg-amber-50 dark:bg-amber-900/30' },
  it:            { label: 'IT',            icon: Monitor,    color: 'text-blue-600 dark:text-blue-300',           bg: 'bg-blue-50 dark:bg-blue-900/30' },
  document:      { label: 'Document',      icon: FileText,   color: 'text-cyan-600 dark:text-cyan-300',           bg: 'bg-cyan-50 dark:bg-cyan-900/30' },
  general:       { label: 'General',       icon: HelpCircle, color: 'text-slate-600 dark:text-slate-300',         bg: 'bg-slate-100 dark:bg-slate-800' },
};

const STATUS_META: Record<TicketStatus, { label: string; icon: any; cls: string }> = {
  open:           { label: 'Open',         icon: Inbox,        cls: 'text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-900/30 border-orange-200 dark:border-orange-800' },
  in_progress:    { label: 'In progress',  icon: Loader2,      cls: 'text-cyan-700 dark:text-cyan-300 bg-cyan-50 dark:bg-cyan-900/30 border-cyan-200 dark:border-cyan-800' },
  waiting_human:  { label: 'Needs HR',     icon: AlertTriangle, cls: 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800' },
  resolved:       { label: 'Resolved',     icon: CheckCircle2, cls: 'text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800' },
  closed:         { label: 'Closed',       icon: Lock,         cls: 'text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700' },
};

const PRIO_META: Record<TicketPriority, { label: string; cls: string }> = {
  low:    { label: 'Low',    cls: 'text-slate-500' },
  normal: { label: 'Normal', cls: 'text-slate-500' },
  high:   { label: 'High',   cls: 'text-orange-600 dark:text-orange-400' },
  urgent: { label: 'Urgent', cls: 'text-red-600 dark:text-red-400' },
};

// ─── Page ──────────────────────────────────────────────────────────────────

export function HelpdeskPage() {
  const readOnly = useIsReadOnly();
  const { toast } = useToast();
  const [tab, setTab] = useState<'tickets' | 'ai'>('tickets');
  const [statusFilter, setStatusFilter] = useState<TicketStatus | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const { data, isLoading } = useTickets({
    status: statusFilter === 'all' ? undefined : statusFilter,
    category: categoryFilter || undefined,
  });
  const [openId, setOpenId] = useState<string | null>(null);
  const rows = data?.data ?? [];

  // Counts for the summary cards — independent of the current filter so the
  // numbers are stable as the user clicks through. Cheap: another useTickets
  // with no status filter could double the load — instead, derive from
  // currently visible rows when filter is "all", and accept that filtered
  // counts only reflect the active subset.
  const counts = useMemo(() => {
    const c = { open: 0, in_progress: 0, resolved: 0, closed: 0 } as Record<TicketStatus, number>;
    for (const t of rows) c[t.status] = (c[t.status] ?? 0) + 1;
    return c;
  }, [rows]);

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'HR', href: '/hr' }, { label: 'Helpdesk' }]}
        title="HR helpdesk"
        description="Employee questions and requests — chat-style ticket threads."
        actions={
          <div className="flex gap-2">
            <Button variant={tab === 'tickets' ? 'primary' : 'outline'} onClick={() => setTab('tickets')}>Tickets</Button>
            <Button variant={tab === 'ai' ? 'primary' : 'outline'} onClick={() => setTab('ai')}>
              <Sparkles className="h-4 w-4 mr-1" />AI Settings
            </Button>
          </div>
        }
      />

      {tab === 'ai' ? <AiSettingsTab readOnly={readOnly} toast={toast} /> : (
      <>

      <div className="grid grid-cols-2 gap-3 mb-5 md:grid-cols-4">
        <SummaryCard label="Open"        value={counts.open}        status="open"        active={statusFilter} onClick={setStatusFilter} />
        <SummaryCard label="In progress" value={counts.in_progress} status="in_progress" active={statusFilter} onClick={setStatusFilter} />
        <SummaryCard label="Resolved"    value={counts.resolved}    status="resolved"    active={statusFilter} onClick={setStatusFilter} />
        <SummaryCard label="Closed"      value={counts.closed}      status="closed"      active={statusFilter} onClick={setStatusFilter} />
      </div>

      <div className="flex items-center justify-between gap-3 mb-3">
        <button
          onClick={() => setStatusFilter('all')}
          className={`text-sm px-3 py-1.5 rounded-md border transition ${
            statusFilter === 'all'
              ? 'bg-cyan-600 text-white border-cyan-600 dark:bg-cyan-500 dark:border-cyan-500'
              : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          All tickets
        </button>
        <div className="w-48">
          <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} options={[
            { value: '', label: 'All categories' },
            ...Object.entries(CATEGORY_META).map(([k, m]) => ({ value: k, label: m.label })),
          ]} />
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : rows.length === 0 ? (
        <EmptyState icon={<LifeBuoy className="h-10 w-10" />} title="No tickets" />
      ) : (
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <Th>Ticket</Th>
                <Th>Employee</Th>
                <Th>Priority</Th>
                <Th>Status</Th>
                <Th>Updated</Th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((t) => <TicketRow key={t.id} ticket={t} onOpen={() => setOpenId(t.id)} />)}
            </TableBody>
          </Table>
        </div>
      )}

      <TicketDrawer id={openId} onClose={() => setOpenId(null)} readOnly={readOnly} toast={toast} />
      </>
      )}
    </div>
  );
}

const TIER_LABELS = ['Off', 'Draft only', 'Auto-send (high confidence)', 'Auto-resolve'];
const TIER_DESC = [
  'AI does not touch this category.',
  'AI drafts a reply for HR to review and send.',
  'AI sends high-confidence replies immediately; HR can undo within 5 minutes.',
  'AI resolves trivial questions end-to-end and only escalates ambiguous ones.',
];

function AiSettingsTab({ readOnly, toast }: { readOnly: boolean; toast: any }) {
  const { data, isLoading } = useAgentSettings();
  const { data: opData } = useAgentOperators();
  const update = useUpdateAgentSettings();
  const [draft, setDraft] = useState<HelpdeskAgentSettings | null>(null);

  useEffect(() => { if (data?.data) setDraft(data.data); }, [data]);

  if (isLoading || !draft) return <div className="text-sm text-slate-500">Loading…</div>;

  const operators = opData?.data ?? [];

  function save() {
    if (!draft) return;
    update.mutate(draft, {
      onSuccess: () => toast('Saved', 'success'),
      onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
    });
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <Card>
        <CardContent className="space-y-3 pt-5">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
              disabled={readOnly}
              className="mt-1"
            />
            <div>
              <div className="font-medium">Enable HR AI Assistant</div>
              <div className="text-xs text-slate-500">When on, the agent reads new tickets, gathers data from the employee's record, and posts replies according to the per-category tier below.</div>
            </div>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 space-y-3">
          <div className="font-medium">Agent operator</div>
          <p className="text-xs text-slate-500 -mt-2">Auto-sent replies will be attributed to this HR user. (Drafts that HR sends manually are always attributed to the sender.)</p>
          <Combobox
            options={[{ value: '', label: '— none —' }, ...operators.map((o) => ({ value: o.id, label: `${o.name ?? o.email} (${o.role})` }))]}
            value={draft.operatorUserId ?? ''}
            onChange={(v) => setDraft({ ...draft, operatorUserId: v || null })}
            placeholder="Pick an HR user"
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 space-y-3">
          <div className="font-medium">Per-category tier</div>
          <p className="text-xs text-slate-500 -mt-2">Start every category at "Draft only". Promote a category to "Auto-send" only after HR has approved most of the agent's drafts on that category.</p>
          <div className="space-y-3">
            {(Object.keys(CATEGORY_META) as TicketCategory[]).map((cat) => {
              const m = CATEGORY_META[cat];
              const Icon = m.icon;
              const setting = draft.perCategory[cat] ?? { tier: 1, autoResolve: false };
              return (
                <div key={cat} className="flex items-start gap-3 border-t border-slate-100 dark:border-slate-800 pt-3 first:border-t-0 first:pt-0">
                  <div className={`h-8 w-8 rounded-md flex items-center justify-center flex-shrink-0 ${m.bg}`}>
                    <Icon className={`h-4 w-4 ${m.color}`} />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-sm">{m.label}</div>
                    <div className="text-xs text-slate-500">{TIER_DESC[setting.tier]}</div>
                  </div>
                  <div className="w-56">
                    <Select
                      value={String(setting.tier)}
                      onChange={(e) => setDraft({
                        ...draft,
                        perCategory: {
                          ...draft.perCategory,
                          [cat]: { ...setting, tier: Number(e.target.value) as 0 | 1 | 2 | 3 },
                        },
                      })}
                      options={TIER_LABELS.map((label, i) => ({ value: String(i), label }))}
                      disabled={readOnly}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 space-y-2">
          <div className="font-medium">Company FAQ</div>
          <p className="text-xs text-slate-500">
            Paste your policies — leave rules, working hours, dress code, reimbursement limits, etc. The agent uses this verbatim when answering policy questions. Up to 20,000 characters.
          </p>
          <Textarea
            rows={12}
            value={draft.faqs}
            onChange={(e) => setDraft({ ...draft, faqs: e.target.value })}
            placeholder={`Example:\n\nWorking hours: Mon–Fri 9:30 AM – 6:30 PM IST.\nLunch: 1 hour (flexible 12–2 PM).\nReimbursement limits: Travel ₹3,000/day, internet ₹1,500/month.\nDress code: Smart casual; formals for client meetings.\nPayday: 7th of every month.\n\n…`}
            disabled={readOnly}
          />
          <div className="text-xs text-slate-400 text-right">{draft.faqs.length} / 20000</div>
        </CardContent>
        <CardFooter className="justify-end">
          {!readOnly && (
            <Button onClick={save} disabled={update.isPending}>
              {update.isPending ? 'Saving…' : 'Save settings'}
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}

function SummaryCard({
  label, value, status, active, onClick,
}: {
  label: string; value: number; status: TicketStatus;
  active: TicketStatus | 'all'; onClick: (s: TicketStatus | 'all') => void;
}) {
  const m = STATUS_META[status];
  const Icon = m.icon;
  const isActive = active === status;
  return (
    <button
      onClick={() => onClick(isActive ? 'all' : status)}
      className={`text-left rounded-lg border p-4 transition ${
        isActive
          ? 'border-cyan-500 ring-2 ring-cyan-500/30 bg-white dark:bg-zinc-900'
          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-zinc-900 hover:border-slate-300 dark:hover:border-slate-700'
      }`}
    >
      <div className="flex items-center gap-2">
        <div className={`h-8 w-8 rounded-md flex items-center justify-center ${m.cls.split(' ').filter((c) => c.startsWith('bg-') || c.startsWith('text-') || c.startsWith('dark:')).join(' ')}`}>
          <Icon className={`h-4 w-4 ${status === 'in_progress' ? 'animate-spin' : ''}`} />
        </div>
        <span className="text-xs uppercase tracking-wide text-slate-500 font-semibold">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums">{value}</div>
    </button>
  );
}

function TicketRow({ ticket, onOpen }: { ticket: HrTicket; onOpen: () => void }) {
  const c = CATEGORY_META[ticket.category] ?? CATEGORY_META.general;
  const Icon = c.icon;
  return (
    <TableRow className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/50 transition" onClick={onOpen}>
      <TableCell>
        <div className="flex items-start gap-3">
          <div className={`h-9 w-9 rounded-md flex items-center justify-center flex-shrink-0 ${c.bg}`}>
            <Icon className={`h-4 w-4 ${c.color}`} />
          </div>
          <div className="min-w-0">
            <div className="font-medium text-slate-900 dark:text-slate-100 truncate">{ticket.subject}</div>
            <div className="text-xs text-slate-500 mt-0.5">{ticket.ticketNumber} · {c.label}</div>
          </div>
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {[ticket.firstName, ticket.lastName].filter(Boolean).join(' ') || '—'}
        {ticket.employeeCode && <div className="text-xs text-slate-500">{ticket.employeeCode}</div>}
      </TableCell>
      <TableCell>
        <PriorityBadge priority={ticket.priority} />
      </TableCell>
      <TableCell>
        <StatusBadge status={ticket.status} />
      </TableCell>
      <TableCell className="text-xs whitespace-nowrap text-slate-500">{new Date(ticket.createdAt).toLocaleDateString()}</TableCell>
    </TableRow>
  );
}

function StatusBadge({ status }: { status: TicketStatus }) {
  const m = STATUS_META[status];
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${m.cls}`}>
      <Icon className={`h-3 w-3 ${status === 'in_progress' ? 'animate-spin' : ''}`} />
      {m.label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: TicketPriority }) {
  const m = PRIO_META[priority];
  if (priority === 'low' || priority === 'normal') {
    return <span className={`text-xs ${m.cls}`}>{m.label}</span>;
  }
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${m.cls}`}>
      <AlertTriangle className="h-3 w-3" />
      {m.label}
    </span>
  );
}

// ─── Drawer chat interface ─────────────────────────────────────────────────

function TicketDrawer({
  id, onClose, readOnly, toast,
}: { id: string | null; onClose: () => void; readOnly: boolean; toast: any }) {
  const { user } = useAuth();
  const myId = user?.id;
  const isHrOperator = user?.role === 'owner' || user?.role === 'accountant' || user?.role === 'hr';
  const { data } = useTicket(id);
  useHrHelpdeskRealtime(id);
  const update = useUpdateTicket();
  const addComment = useAddTicketComment();
  const [body, setBody] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const t = data?.data;

  // Close on Esc.
  useEffect(() => {
    if (!id) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [id, onClose]);

  // Autoscroll on new comments.
  useEffect(() => {
    if (!t?.comments?.length) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [t?.comments?.length]);

  const open = !!id;

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity duration-200 ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={onClose}
      />
      <div
        className={`fixed right-0 top-0 z-50 flex h-full w-full flex-col bg-slate-50 shadow-2xl transition-transform duration-300 ease-out sm:w-[560px] dark:bg-zinc-900 ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {t ? (
          <>
            <DrawerHeader ticket={t} onClose={onClose} />
            {!readOnly && (
              <DrawerControls
                ticket={t}
                onStatusChange={(s) => update.mutate({ id: t.id, status: s }, { onError: (e: any) => toast(e?.message ?? 'Failed', 'error') })}
                onPriorityChange={(p) => update.mutate({ id: t.id, priority: p }, { onError: (e: any) => toast(e?.message ?? 'Failed', 'error') })}
              />
            )}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {t.description && (
                <div className="text-sm bg-white dark:bg-zinc-800 border border-slate-200 dark:border-slate-700 rounded-md p-3">
                  <div className="text-xs text-slate-500 mb-1 font-semibold uppercase">Description</div>
                  <div className="whitespace-pre-wrap text-slate-700 dark:text-slate-200">{t.description}</div>
                </div>
              )}
              {(() => {
                const all = t.comments ?? [];
                const sent = all.filter((c: any) => !c.isAgentDraft);
                if (sent.length === 0) {
                  return <div className="text-center text-sm text-slate-400 py-12">No replies yet — start the conversation.</div>;
                }
                return sent.map((c: any) => (
                  <CommentBubble key={c.id} comment={c} isMe={c.authorUserId === myId} />
                ));
              })()}
            </div>
            {isHrOperator && (
              <AgentDraftStrip ticketId={t.id} comments={t.comments ?? []} onPromoteToComposer={setBody} toast={toast} />
            )}
            <DrawerComposer
              value={body}
              onChange={setBody}
              busy={addComment.isPending}
              onSend={() => {
                const v = body.trim();
                if (!v) return;
                addComment.mutate({ id: t.id, body: v }, {
                  onSuccess: () => setBody(''),
                  onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
                });
              }}
            />
          </>
        ) : (
          open ? <div className="flex-1 flex items-center justify-center text-sm text-slate-500">Loading…</div> : null
        )}
      </div>
    </>
  );
}

function DrawerHeader({ ticket, onClose }: { ticket: any; onClose: () => void }) {
  const c = CATEGORY_META[ticket.category as TicketCategory] ?? CATEGORY_META.general;
  const Icon = c.icon;
  return (
    <div className="flex items-start justify-between border-b border-slate-200 dark:border-slate-700 px-4 py-3 bg-white dark:bg-zinc-900">
      <div className="flex items-start gap-3 min-w-0">
        <div className={`h-9 w-9 rounded-md flex items-center justify-center flex-shrink-0 ${c.bg}`}>
          <Icon className={`h-4 w-4 ${c.color}`} />
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">{ticket.subject}</div>
          <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
            <span>{ticket.ticketNumber}</span>
            <span>·</span>
            <span>{c.label}</span>
            <span>·</span>
            <span>
              {[ticket.firstName, ticket.lastName].filter(Boolean).join(' ')}
              {ticket.employeeCode && ` (${ticket.employeeCode})`}
            </span>
          </div>
        </div>
      </div>
      <button
        onClick={onClose}
        className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function DrawerControls({
  ticket, onStatusChange, onPriorityChange,
}: { ticket: any; onStatusChange: (s: string) => void; onPriorityChange: (p: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-zinc-800">
      <div className="flex items-center gap-2">
        <StatusBadge status={ticket.status} />
      </div>
      <div className="ml-auto flex items-center gap-2">
        <div className="w-36">
          <Select value={ticket.status} onChange={(e) => onStatusChange(e.target.value)} options={[
            { value: 'open', label: 'Open' },
            { value: 'in_progress', label: 'In progress' },
            { value: 'resolved', label: 'Resolved' },
            { value: 'closed', label: 'Closed' },
          ]} />
        </div>
        <div className="w-32">
          <Select value={ticket.priority} onChange={(e) => onPriorityChange(e.target.value)} options={[
            { value: 'low', label: 'Low' },
            { value: 'normal', label: 'Normal' },
            { value: 'high', label: 'High' },
            { value: 'urgent', label: 'Urgent' },
          ]} />
        </div>
      </div>
    </div>
  );
}

function CommentBubble({ comment, isMe }: { comment: any; isMe: boolean }) {
  const author = comment.authorName ?? comment.authorEmail ?? 'HR';
  const time = new Date(comment.createdAt).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const isAiSent = !comment.isAgentDraft && !!comment.agentConfidence;
  return (
    <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
      {!isMe && (
        <div className="text-[11px] text-slate-500 px-2 mb-0.5 font-semibold flex items-center gap-1.5">
          {author}
          {isAiSent && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300 text-[9px] font-bold uppercase tracking-wide">
              <Sparkles className="h-2.5 w-2.5" /> AI
            </span>
          )}
        </div>
      )}
      <div
        className={`max-w-[78%] px-3.5 py-2 text-sm leading-relaxed shadow-sm ${
          isMe
            ? 'bg-cyan-600 text-white rounded-2xl rounded-br-md'
            : 'bg-white dark:bg-zinc-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-2xl rounded-bl-md'
        }`}
      >
        <div className="hr-chat-md">
          <ChatMarkdown content={comment.body} inverted={isMe} />
        </div>
      </div>
      <div className="text-[10px] text-slate-400 px-2 mt-0.5">{time}</div>
    </div>
  );
}

function AgentDraftStrip({
  ticketId, comments, onPromoteToComposer, toast,
}: {
  ticketId: string;
  comments: any[];
  onPromoteToComposer: (body: string) => void;
  toast: (msg: string, variant?: 'success' | 'error') => void;
}) {
  const drafts = comments.filter((c) => c.isAgentDraft);
  const accept = useAcceptAgentDraft();
  const discard = useDiscardAgentDraft();
  if (drafts.length === 0) return null;

  return (
    <div className="border-t border-teal-200 dark:border-teal-900 bg-teal-50 dark:bg-teal-950/40">
      {drafts.map((d) => {
        const meta = (d as any).agentMetadata as Record<string, unknown> | undefined;
        const isEscalationNote = meta?.escalated === true;
        const confidence = d.agentConfidence as 'low' | 'medium' | 'high' | undefined;
        const cBadge =
          confidence === 'high' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
          : confidence === 'medium' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
          : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300';

        // Escalation notes are HR-only context — never sendable to employee.
        if (isEscalationNote) {
          return (
            <div key={d.id} className="px-4 py-3 bg-amber-50/60 dark:bg-amber-950/30 border-t-2 border-amber-300 dark:border-amber-800 first:border-t-0">
              <div className="flex items-center gap-2 mb-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-700 dark:text-amber-300" />
                <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">AI flagged — internal note</span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 ml-auto">Visible to HR only</span>
              </div>
              <div className="text-sm text-slate-800 dark:text-slate-100 bg-white dark:bg-zinc-900 border border-amber-200 dark:border-amber-900 rounded-md p-3 hr-chat-md">
                <ChatMarkdown content={d.body.replace(/^\(agent escalated this ticket\)\s*\n+/i, '')} />
              </div>
              <div className="flex items-center gap-2 mt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => discard.mutate(
                    { ticketId, commentId: d.id },
                    { onError: (e: any) => toast(e?.message ?? 'Failed to dismiss', 'error') },
                  )}
                  disabled={discard.isPending}
                >
                  Dismiss note
                </Button>
              </div>
            </div>
          );
        }

        return (
          <div key={d.id} className="px-4 py-3">
            <div className="flex items-center gap-2 mb-1.5">
              <Sparkles className="h-3.5 w-3.5 text-teal-600 dark:text-teal-300" />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">AI draft</span>
              {confidence && (
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${cBadge}`}>
                  {confidence} confidence
                </span>
              )}
              {Array.isArray(d.agentCitations) && d.agentCitations.length > 0 && (
                <span className="text-[10px] text-slate-500 dark:text-slate-400">
                  · {d.agentCitations.map((c: any) => c.tool).join(', ')}
                </span>
              )}
            </div>
            <div className="text-sm text-slate-800 dark:text-slate-100 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-slate-700 rounded-md p-3 hr-chat-md">
              <ChatMarkdown content={d.body} />
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Button
                size="sm"
                onClick={() => accept.mutate(
                  { ticketId, commentId: d.id },
                  { onError: (e: any) => toast(e?.message ?? 'Failed to send', 'error') },
                )}
                disabled={accept.isPending}
              >
                <Send className="h-3.5 w-3.5 mr-1" /> Send
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onPromoteToComposer(d.body)}
              >
                Edit
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => discard.mutate(
                  { ticketId, commentId: d.id },
                  { onError: (e: any) => toast(e?.message ?? 'Failed to discard', 'error') },
                )}
                disabled={discard.isPending}
              >
                Discard
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DrawerComposer({
  value, onChange, onSend, busy,
}: { value: string; onChange: (v: string) => void; onSend: () => void; busy: boolean }) {
  const canSend = !busy && value.trim().length > 0;
  return (
    <div className="border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-zinc-900 px-3 py-3">
      <div className="flex items-end gap-2">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type a reply…"
          rows={1}
          onInput={(e) => {
            const el = e.currentTarget;
            el.style.height = 'auto';
            el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (canSend) onSend();
            }
          }}
          className="flex-1 resize-none rounded-2xl bg-slate-100 dark:bg-zinc-800 border border-transparent focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 focus:bg-white dark:focus:bg-zinc-900 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm px-4 outline-none transition-colors"
          style={{ minHeight: 40, maxHeight: 140, lineHeight: '24px', paddingTop: 8, paddingBottom: 8 }}
        />
        <button
          onClick={onSend}
          disabled={!canSend}
          aria-label="Send"
          className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 transition-colors shadow-sm ${
            canSend
              ? 'bg-cyan-600 hover:bg-cyan-700 text-white'
              : 'bg-slate-200 dark:bg-zinc-700 text-slate-400 cursor-not-allowed'
          }`}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
      <div className="text-[10px] text-slate-400 mt-1 px-3">Enter to send · Shift+Enter for newline</div>
    </div>
  );
}
