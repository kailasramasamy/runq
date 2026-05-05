import { Sparkles, CheckCheck, History } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { useAuth } from '../../providers/auth-provider';
import { formatINR, formatINRShort } from '../../lib/utils';
import { Pill, Dot, type Tone } from './primitives';
import { useBankBalances, useAISummary, useDashboardSummary } from '../../hooks/queries/use-dashboard';

interface InsightItem {
  label: string;
  amount: string;
  note: string;
  severity: 'ok' | 'warning' | 'critical';
}

/** AI summary returns a JSON array of insight items embedded in markdown
 * (often inside ```json fences with extra prose). Pull out the array. */
function parseInsights(raw: string | undefined): InsightItem[] {
  if (!raw) return [];
  const m = raw.match(/\[[\s\S]*\]/);
  for (const c of [raw, m?.[0]]) {
    if (!c) continue;
    try {
      const parsed = JSON.parse(c);
      if (!Array.isArray(parsed)) continue;
      return parsed
        .filter(
          (p): p is InsightItem =>
            typeof p?.label === 'string' && typeof p?.note === 'string',
        )
        .map((p) => ({
          label: p.label,
          amount: typeof p.amount === 'string' ? p.amount : '',
          note: p.note,
          severity: p.severity === 'critical' || p.severity === 'warning' ? p.severity : 'ok',
        }));
    } catch { /* try next */ }
  }
  return [];
}

const SEV_TO_TONE: Record<InsightItem['severity'], Tone> = {
  ok: 'pos',
  warning: 'warn',
  critical: 'neg',
};

const BANK_COLORS = ['#5B5BD6', '#D9A14A', '#2B9F6E', '#D44A3F', '#7C3AED', '#0EA5E9'];

function lastFour(name: string, id: string): string {
  // Use last 4 of bank-account id as a stable display token. Real account
  // numbers aren't returned from /bank-balances for privacy.
  return id.slice(-4);
}

export function DashboardHero({ onAskAgent }: { onAskAgent?: () => void } = {}) {
  const navigate = useNavigate();
  const openAgent = onAskAgent ?? (() => window.dispatchEvent(new Event('runq:open-finance-agent')));
  const { user } = useAuth();
  const banks = useBankBalances();
  const aiSummary = useAISummary();
  const summary = useDashboardSummary();

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const dateStr = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  const firstName = (user?.name ?? 'there').split(' ')[0];

  const accounts = banks.data?.accounts ?? [];
  const total = banks.data?.total ?? 0;
  const overdueCount = summary.data?.data.overdueCount ?? 0;

  const insights = parseInsights(aiSummary.data?.data.summary);
  // Sort: critical first, then warning, then ok. Show top 3.
  const sevRank = { critical: 0, warning: 1, ok: 2 } as const;
  const topInsights = [...insights]
    .sort((a, b) => sevRank[a.severity] - sevRank[b.severity])
    .slice(0, 3);
  const priorityCount = insights.filter((i) => i.severity !== 'ok').length;

  return (
    <div
      className="relative overflow-hidden rounded-2xl border"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <div className="absolute inset-0 grid-bg opacity-50" />
      <div
        className="absolute -right-20 -top-20 h-80 w-80 rounded-full opacity-30"
        style={{ background: 'radial-gradient(circle, var(--accent-soft) 0%, transparent 60%)' }}
      />
      <div className="relative flex flex-col gap-6 p-6 lg:flex-row lg:items-center lg:p-7">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-3)' }}>
            <Dot tone="pos" className="pulse-soft" />
            <span>All systems healthy · {dateStr}</span>
          </div>
          <h1 className="text-[26px] font-semibold tracking-tight" style={{ color: 'var(--text-1)' }}>
            {greeting}, {firstName}.
          </h1>
          <p className="mt-1.5 max-w-xl text-[14px] leading-relaxed" style={{ color: 'var(--text-2)' }}>
            {aiSummary.isLoading
              ? 'Generating your morning briefing…'
              : insights.length > 0
                ? priorityCount > 0
                  ? `${priorityCount} item${priorityCount === 1 ? '' : 's'} need your attention. Here's where you stand:`
                  : 'Everything is on track. Here\'s a quick snapshot:'
                : aiSummary.data?.data.summary ??
                  `You have ${overdueCount} overdue items to review.`}
          </p>
          {topInsights.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {topInsights.map((it) => (
                <div
                  key={it.label}
                  className="inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5"
                  style={{
                    borderColor: 'var(--border)',
                    background: 'var(--surface-2)',
                  }}
                >
                  <Pill tone={SEV_TO_TONE[it.severity]}>{it.label}</Pill>
                  {it.amount && (
                    <span className="num text-[12px] font-semibold" style={{ color: 'var(--text-1)' }}>
                      {it.amount}
                    </span>
                  )}
                  <span className="text-[12px]" style={{ color: 'var(--text-2)' }}>
                    {it.note}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              onClick={openAgent}
              className="flex h-9 items-center gap-2 whitespace-nowrap rounded-md px-3.5 text-[13px] font-medium text-white hover:opacity-90"
              style={{ background: 'var(--accent)' }}
            >
              <Sparkles size={14} /> Open agent
            </button>
            {overdueCount > 0 && (
              <button
                onClick={() => navigate({ to: '/ar/invoices', search: { status: 'overdue' } })}
                className="flex h-9 items-center gap-2 whitespace-nowrap rounded-md border px-3.5 text-[13px] font-medium hover:bg-[color:var(--surface)]"
                style={{
                  borderColor: 'var(--border)',
                  background: 'var(--surface-2)',
                  color: 'var(--text-1)',
                }}
              >
                <CheckCheck size={14} /> Review {overdueCount} item{overdueCount === 1 ? '' : 's'}
              </button>
            )}
            <button
              onClick={() => navigate({ to: '/agent/activity' })}
              className="flex h-9 items-center gap-2 whitespace-nowrap rounded-md px-3 text-[13px] hover:bg-[color:var(--surface-2)]"
              style={{ color: 'var(--text-2)' }}
            >
              <History size={12} /> View agent activity
            </button>
          </div>
        </div>

        <div className="shrink-0 lg:w-[340px]">
          <div
            className="rounded-xl border p-4"
            style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
          >
            <div className="mb-1 flex items-center justify-between">
              <div
                className="text-[11px] font-medium uppercase tracking-wider"
                style={{ color: 'var(--text-3)' }}
              >
                Total cash
              </div>
              <Pill tone="pos">{accounts.length} accounts</Pill>
            </div>
            <div className="num text-[28px] font-semibold leading-tight" style={{ color: 'var(--text-1)' }}>
              {formatINR(total)}
            </div>
            <div className="mt-0.5 text-[11px]" style={{ color: 'var(--text-3)' }}>
              across {accounts.length || 'your'} {accounts.length === 1 ? 'account' : 'accounts'}
            </div>
            <div className="mt-3 space-y-1.5">
              {banks.isLoading && (
                <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>Loading bank balances…</div>
              )}
              {!banks.isLoading && accounts.length === 0 && (
                <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                  No bank accounts yet — add one in Banking to see balances here.
                </div>
              )}
              {accounts.map((b, i) => {
                const bal = parseFloat(b.currentBalance) || 0;
                const pct = total > 0 ? (bal / total) * 100 : 0;
                const color = BANK_COLORS[i % BANK_COLORS.length];
                return (
                  <div key={b.id} className="flex items-center gap-2 text-[11px]">
                    <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: color }} />
                    <span className="flex-1 truncate" style={{ color: 'var(--text-2)' }}>
                      {b.name} · ····{lastFour(b.name, b.id)}
                    </span>
                    <span className="num whitespace-nowrap" style={{ color: 'var(--text-1)' }}>
                      {formatINRShort(bal)}
                    </span>
                    <span className="num w-9 whitespace-nowrap text-right" style={{ color: 'var(--text-3)' }}>
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
