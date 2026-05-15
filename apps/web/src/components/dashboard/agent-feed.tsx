import { useNavigate } from '@tanstack/react-router';
import {
  Sparkles, CheckCircle2, AlertTriangle, FileText, RefreshCw, Info,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card2, CardTitle, Dot } from './primitives';
import { useAgentFeed } from '../../hooks/queries/use-dashboard';
import type { AgentEvent } from '../../hooks/queries/use-dashboard';

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

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 1) return 'Yest';
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

const SEV_COLOR: Record<AgentEvent['severity'], string> = {
  ok: 'var(--pos)',
  warn: 'var(--warn)',
  info: 'var(--accent-text)',
};

export function AgentFeed() {
  const navigate = useNavigate();
  const { data, isLoading } = useAgentFeed(10);
  // Show only the most recent 4 in the dashboard tile — the full feed
  // lives at /agent/activity, reachable via the "See all" link below.
  const events = (data?.data ?? []).slice(0, 4);

  return (
    <Card2 className="scroll-mt-4" id="agent-feed">
      <CardTitle
        icon={<Sparkles size={14} style={{ color: 'var(--accent-text)' }} />}
        action={
          <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-3)' }}>
            <Dot tone="pos" className="pulse-soft" />
            <span>Live</span>
            <span style={{ color: 'var(--border)' }}>·</span>
            <button
              onClick={() => navigate({ to: '/finance/agent/activity' })}
              className="font-medium hover:underline"
              style={{ color: 'var(--accent-text)' }}
            >
              See all
            </button>
          </div>
        }
      >
        runQ Agent
      </CardTitle>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded"
              style={{ background: 'var(--surface-2)' }}
            />
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="rounded-md py-8 text-center text-[12px]" style={{ color: 'var(--text-3)' }}>
          <Sparkles size={24} className="mx-auto mb-2 opacity-50" />
          <div>No agent activity yet.</div>
          <div className="mt-0.5">runQ will populate this as it reconciles, drafts, and flags.</div>
        </div>
      ) : (
        <div className="space-y-0">
          {events.map((e, i) => {
            const Icon = iconFor(e);
            return (
              <div
                key={e.id}
                className="flex gap-2.5 py-2.5"
                style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border-soft)' }}
              >
                <div className="shrink-0 pt-0.5">
                  <Icon size={14} style={{ color: SEV_COLOR[e.severity] }} />
                </div>
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
                  {e.ctaLabel && e.ctaUrl && (
                    <button
                      onClick={() => navigate({ to: e.ctaUrl as '/' })}
                      className="mt-1 text-[11px] font-medium hover:underline"
                      style={{ color: 'var(--accent-text)' }}
                    >
                      {e.ctaLabel} →
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card2>
  );
}
