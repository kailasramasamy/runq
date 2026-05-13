import type { ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Check, AlertTriangle, ArrowUpRight, ShieldCheck, CircleDot, CalendarCheck } from 'lucide-react';
import { Card2, CardTitle, Ring } from './primitives';
import { useGstReadiness, usePeriodClose } from '../../hooks/queries/use-dashboard';
import type { PeriodCloseItem } from '../../hooks/queries/use-dashboard';

const STATUS_COLOR: Record<PeriodCloseItem['status'], string> = {
  done: 'var(--pos)',
  progress: 'var(--warn)',
  pending: 'var(--text-3)',
};

function daysUntil(dateStr: string): number {
  const due = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

/** GSTR-2B is auto-generated on the 14th — three days after GSTR-1's 11th deadline. */
function gstr2bDate(gstr1DueDate: string): string {
  const d = new Date(gstr1DueDate);
  d.setDate(d.getDate() + 3);
  return d.toISOString().slice(0, 10);
}

function readinessSubtitle(score: number): string {
  if (score >= 95) return 'runQ has it all ready';
  if (score >= 80) return 'runQ has prepared most of it';
  if (score >= 60) return 'A few things still need attention';
  return 'Several items need your review';
}

// Signals that are static config or "all good" data-quality checks.
// Hide these when they pass — they're not actionable for the current
// filing and the user has already confirmed them at setup time. They
// still surface when failing (where they block filing).
const HIDE_WHEN_OK = new Set([
  'gstin_configured',
  'gst_username',
  'invoices_with_hsn',
  'invoices_with_pos',
  'customers_with_gstin',
]);

function returnStatusLabel(exists: boolean, status: string | null): string {
  if (!exists) return 'pending';
  if (status === 'filed') return 'filed';
  if (status === 'uploaded') return 'uploaded';
  if (status === 'validated') return 'validated';
  if (status === 'error') return 'errored';
  return 'draft ready';
}

function ReturnCard({
  label, dueDate, daysLeft, statusLabel, isFiled, infoOnly,
}: {
  label: string;
  dueDate: string;
  daysLeft: number;
  statusLabel: string;
  isFiled?: boolean;
  infoOnly?: boolean;
}) {
  // Tone the days-left pill: red if overdue, amber if ≤7 days, neutral otherwise.
  // Filed wins everything — show a green "Filed" pill regardless of date.
  // Info-only (e.g. GSTR-2B sync) never goes red.
  let pillBg: string;
  let pillFg: string;
  let pillLabel: string;
  let pillIcon: ReactNode = null;

  if (isFiled) {
    pillBg = 'var(--pos-soft)';
    pillFg = 'var(--pos)';
    pillLabel = 'Filed';
    pillIcon = <Check size={10} strokeWidth={3} />;
  } else if (infoOnly) {
    pillBg = 'var(--surface-2)';
    pillFg = 'var(--text-2)';
    pillLabel =
      daysLeft < 0 ? `${Math.abs(daysLeft)}d ago` :
      daysLeft === 0 ? 'today' :
      `in ${daysLeft}d`;
  } else {
    pillBg =
      daysLeft < 0 ? 'var(--neg-soft)' :
      daysLeft <= 7 ? 'var(--warn-soft)' : 'var(--surface-2)';
    pillFg =
      daysLeft < 0 ? 'var(--neg)' :
      daysLeft <= 7 ? 'var(--warn)' : 'var(--text-2)';
    pillLabel =
      daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` :
      daysLeft === 0 ? 'due today' :
      `${daysLeft} d left`;
  }

  const due = new Date(dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

  return (
    <div
      className="flex-1 rounded-xl border p-3"
      style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>
          {label}
        </span>
        <span
          className="num inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold"
          style={{ background: pillBg, color: pillFg, borderColor: 'transparent' }}
        >
          {pillIcon}
          {pillLabel}
        </span>
      </div>
      <div className="mt-1 text-[12px]" style={{ color: 'var(--text-2)' }}>
        {infoOnly ? `Auto-sync ${due}` : `Due ${due}`} · {statusLabel}
      </div>
    </div>
  );
}

function GstReadinessCard() {
  const navigate = useNavigate();
  const { data, isLoading } = useGstReadiness();
  const r = data?.data;

  const score = r?.score ?? 0;
  const tone: 'pos' | 'warn' | 'neg' = score >= 85 ? 'pos' : score >= 60 ? 'warn' : 'neg';

  return (
    <Card2>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span
            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border"
            style={{
              background: 'var(--surface-2)',
              borderColor: 'var(--border)',
              color: 'var(--text-2)',
            }}
          >
            <ShieldCheck size={14} />
          </span>
          <div>
            <div className="text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>
              GST readiness
            </div>
            <div className="text-[12px]" style={{ color: 'var(--text-3)' }}>
              {r?.periodLabel ?? 'Current period'}
              {r?.targetLabel && (
                <>
                  {' · '}
                  <span style={{ color: 'var(--text-2)' }}>Readiness for {r.targetLabel}</span>
                </>
              )}
              {' · '}
              {readinessSubtitle(score)}
            </div>
          </div>
        </div>
        <button
          onClick={() => navigate({ to: '/gst' })}
          className="flex shrink-0 items-center gap-1 text-[12px] font-medium hover:underline"
          style={{ color: 'var(--accent-text)' }}
        >
          <ArrowUpRight size={12} /> Open filing
        </button>
      </div>

      {isLoading ? (
        <div className="mt-4 h-24 animate-pulse rounded" style={{ background: 'var(--surface-2)' }} />
      ) : (
        <>
          <div className="mt-4 flex items-stretch gap-3">
            <div
              className="flex w-[140px] shrink-0 flex-col items-center justify-center rounded-xl border p-3"
              style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
            >
              <Ring value={score} tone={tone} size={84} label="READY" />
            </div>
            {r && (
              <>
                <ReturnCard
                  label="GSTR-1"
                  dueDate={r.dueDates.gstr1}
                  daysLeft={daysUntil(r.dueDates.gstr1)}
                  statusLabel={returnStatusLabel(r.returns.gstr1.exists, r.returns.gstr1.status)}
                  isFiled={r.returns.gstr1.status === 'filed'}
                />
                <ReturnCard
                  label="GSTR-2B"
                  dueDate={gstr2bDate(r.dueDates.gstr1)}
                  daysLeft={daysUntil(gstr2bDate(r.dueDates.gstr1))}
                  statusLabel="ITC sync — reconcile"
                  infoOnly
                />
                <ReturnCard
                  label="GSTR-3B"
                  dueDate={r.dueDates.gstr3b}
                  daysLeft={daysUntil(r.dueDates.gstr3b)}
                  statusLabel={returnStatusLabel(r.returns.gstr3b.exists, r.returns.gstr3b.status)}
                  isFiled={r.returns.gstr3b.status === 'filed'}
                />
              </>
            )}
          </div>

          {(() => {
            const visible = (r?.signals ?? []).filter((s) => !(s.ok && HIDE_WHEN_OK.has(s.key)));
            if (visible.length === 0) return null;
            return (
            <div className="mt-4">
              <div
                className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em]"
                style={{ color: 'var(--text-3)' }}
              >
                Checks
              </div>
              <ul className="space-y-1.5">
                {visible.map((s) => {
                  const Icon = s.ok ? Check : AlertTriangle;
                  const fg = s.ok ? 'var(--pos)' : 'var(--warn)';
                  const bg = s.ok ? 'var(--pos-soft)' : 'var(--warn-soft)';
                  return (
                    <li key={s.key} className="flex items-start gap-2 text-[12px]">
                      <span
                        className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                        style={{ background: bg, color: fg }}
                      >
                        <Icon size={10} strokeWidth={3} />
                      </span>
                      <span style={{ color: 'var(--text-1)' }}>
                        <span className="font-semibold">{s.label}</span>
                        {s.detail && (
                          <span style={{ color: 'var(--text-2)' }}> — {s.detail}</span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
            );
          })()}
        </>
      )}
    </Card2>
  );
}

const PERIOD_CLOSE_LINKS: Record<string, string> = {
  bank_recon: '/banking/reconciliation',
  invoices_reviewed: '/ar/invoices',
  bills_approved: '/ap/bills',
  gst_filed: '/gst',
  period_lock: '/reports/fiscal-periods',
};

function PeriodCloseCard() {
  const navigate = useNavigate();
  const { data, isLoading } = usePeriodClose();
  const items = data?.data.items ?? [];
  const progressPct = data?.data.progressPct ?? 0;

  return (
    <Card2>
      <CardTitle
        icon={<CalendarCheck size={14} />}
        action={
          <span className="num text-[12px] font-semibold" style={{ color: 'var(--text-1)' }}>
            {progressPct}%
          </span>
        }
      >
        Period close
      </CardTitle>

      <div
        className="mb-3 h-1.5 w-full overflow-hidden rounded-full"
        style={{ background: 'var(--surface-2)' }}
      >
        <div
          className="h-1.5 rounded-full transition-all duration-500"
          style={{ width: `${progressPct}%`, background: 'var(--pos)' }}
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-8 animate-pulse rounded"
              style={{ background: 'var(--surface-2)' }}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((it) => {
            const color = STATUS_COLOR[it.status];
            const to = PERIOD_CLOSE_LINKS[it.key];
            return (
              <button
                key={it.key}
                type="button"
                onClick={() => to && navigate({ to: to as '/' })}
                disabled={!to}
                className="-mx-2 flex w-[calc(100%+1rem)] items-start gap-2.5 rounded-md px-2 py-1 text-left transition-colors hover:bg-[color:var(--surface-2)] disabled:cursor-default disabled:hover:bg-transparent"
              >
                <span
                  className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border"
                  style={{
                    borderColor: it.status === 'done' ? color : 'var(--border)',
                    background: it.status === 'done' ? color : 'transparent',
                    color: it.status === 'done' ? 'var(--surface)' : color,
                  }}
                >
                  {it.status === 'done' ? (
                    <Check size={10} strokeWidth={3} />
                  ) : it.status === 'progress' ? (
                    <CircleDot size={8} strokeWidth={3} fill="currentColor" />
                  ) : null}
                </span>
                <div className="min-w-0 flex-1">
                  <div
                    className="text-[12px]"
                    style={{
                      color: it.status === 'pending' ? 'var(--text-3)' : 'var(--text-1)',
                      textDecoration: it.status === 'done' ? 'line-through' : 'none',
                    }}
                  >
                    {it.label}
                  </div>
                  <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>{it.sub}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </Card2>
  );
}

export function GstAndPeriodClose() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <div className="lg:col-span-7">
        <GstReadinessCard />
      </div>
      <div className="lg:col-span-5">
        <PeriodCloseCard />
      </div>
    </div>
  );
}
