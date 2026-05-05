import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  Sparkles, CheckCircle2, AlertTriangle, FileText, RefreshCw, Info,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAgentFeed } from '@/hooks/queries/use-dashboard';
import type { AgentEvent } from '@/hooks/queries/use-dashboard';
import {
  PageHeader, Button, Select, StatTile, EmptyState,
} from '@/components/ar/primitives';

const KIND_ICON: Record<string, LucideIcon> = {
  reconcile: RefreshCw,
  gst_draft: FileText,
  flag_invoice: AlertTriangle,
  send_reminder: CheckCircle2,
  irn_generate: Sparkles,
};

function iconFor(e: AgentEvent): LucideIcon {
  if (KIND_ICON[e.kind]) return KIND_ICON[e.kind];
  if (e.severity === 'ok') return CheckCircle2;
  if (e.severity === 'warn') return AlertTriangle;
  return Info;
}

const SEV_COLOR: Record<AgentEvent['severity'], string> = {
  ok: 'var(--pos)',
  warn: 'var(--warn)',
  info: 'var(--accent-text)',
};

const SEV_LABEL: Record<AgentEvent['severity'], string> = {
  ok: 'Success',
  warn: 'Needs review',
  info: 'Info',
};

const SEV_OPTIONS = [
  { value: '', label: 'All severities' },
  { value: 'ok', label: 'Success only' },
  { value: 'warn', label: 'Needs review' },
  { value: 'info', label: 'Info' },
];

function dayKey(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short' });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function AgentActivityPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useAgentFeed(100);
  const events = data?.data ?? [];

  const [sevFilter, setSevFilter] = useState('');
  const [kindFilter, setKindFilter] = useState('');

  const kinds = useMemo(() => {
    const set = new Set<string>();
    events.forEach((e) => set.add(e.kind));
    return Array.from(set).sort();
  }, [events]);

  const filtered = events.filter((e) => {
    if (sevFilter && e.severity !== sevFilter) return false;
    if (kindFilter && e.kind !== kindFilter) return false;
    return true;
  });

  // Group by day key (Today, Yesterday, weekday + date)
  const groups = useMemo(() => {
    const map = new Map<string, AgentEvent[]>();
    for (const e of filtered) {
      const k = dayKey(e.occurredAt);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(e);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const okCount = events.filter((e) => e.severity === 'ok').length;
  const warnCount = events.filter((e) => e.severity === 'warn').length;
  const infoCount = events.filter((e) => e.severity === 'info').length;

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Agent', href: '/agent/activity' }, { label: 'Activity' }]}
        title="Agent activity"
        description="Everything runQ has done on your books — reconciliations, drafts, flags, reminders, and IRN generations."
        actions={<Button variant="outline" size="sm" onClick={() => navigate({ to: '/' })}>Back to dashboard</Button>}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Total events" value={events.length} sub="In the last 100" />
        <StatTile label="Successful" value={okCount} sub="Auto-completed" tone="pos" />
        <StatTile label="Needs review" value={warnCount} sub="Flagged for you" tone={warnCount > 0 ? 'warn' : 'neutral'} />
        <StatTile label="Informational" value={infoCount} sub="Heads-up notes" />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select
          options={SEV_OPTIONS}
          value={sevFilter}
          onChange={(e) => setSevFilter(e.target.value)}
        />
        <Select
          options={[{ value: '', label: 'All actions' }, ...kinds.map((k) => ({ value: k, label: k.replace(/_/g, ' ') }))]}
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value)}
        />
        <div className="flex-1" />
        <span className="num text-[12px]" style={{ color: 'var(--text-3)' }}>
          {filtered.length} event{filtered.length === 1 ? '' : 's'}
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded-xl border"
              style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <EmptyState
            icon={<Sparkles size={18} />}
            title="No agent activity matches your filters"
            description="Try clearing filters, or wait for runQ to record its next action."
          />
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map(([day, items]) => (
            <div key={day}>
              <div
                className="mb-2 text-[10.5px] font-medium uppercase tracking-wider"
                style={{ color: 'var(--text-3)' }}
              >
                {day} · <span className="num">{items.length}</span>
              </div>
              <div
                className="overflow-hidden rounded-xl border"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
              >
                {items.map((e, i) => {
                  const Icon = iconFor(e);
                  return (
                    <div
                      key={e.id}
                      className="flex items-start gap-3 px-4 py-3"
                      style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border-soft)' }}
                    >
                      <span
                        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border"
                        style={{
                          background: 'var(--surface-2)',
                          borderColor: 'var(--border)',
                          color: SEV_COLOR[e.severity],
                        }}
                      >
                        <Icon size={14} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <div className="text-[13px] font-medium" style={{ color: 'var(--text-1)' }}>
                            {e.title}
                          </div>
                          <span className="num shrink-0 text-[11px]" style={{ color: 'var(--text-3)' }}>
                            {formatTime(e.occurredAt)}
                          </span>
                        </div>
                        {e.detail && (
                          <div className="mt-0.5 text-[12px]" style={{ color: 'var(--text-2)' }}>
                            {e.detail}
                          </div>
                        )}
                        <div className="mt-1 flex items-center gap-3">
                          <span
                            className="inline-flex items-center gap-1 rounded px-1.5 py-[2px] text-[10px] font-medium"
                            style={{
                              background: e.severity === 'ok' ? 'var(--pos-soft)'
                                : e.severity === 'warn' ? 'var(--warn-soft)'
                                : 'var(--accent-soft)',
                              color: SEV_COLOR[e.severity],
                            }}
                          >
                            {SEV_LABEL[e.severity]}
                          </span>
                          <span className="text-[10.5px] uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
                            {e.kind.replace(/_/g, ' ')}
                          </span>
                          {e.ctaLabel && e.ctaUrl && (
                            <button
                              onClick={() => navigate({ to: e.ctaUrl as '/' })}
                              className="ml-auto text-[11.5px] font-medium hover:underline"
                              style={{ color: 'var(--accent-text)' }}
                            >
                              {e.ctaLabel} →
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
