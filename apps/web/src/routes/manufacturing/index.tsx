import { Link } from '@tanstack/react-router';
import {
  FlaskConical, Factory, ClipboardList, Plus,
  PlayCircle, Timer, TrendingUp, AlertTriangle, BarChart3,
} from 'lucide-react';
import {
  PageHeader, Card, CardContent, Skeleton, EmptyState,
} from '@/components/ui';
import { useMfgDashboard } from '@/hooks/queries/use-mfg-reports';
import { useWorkOrders } from '@/hooks/queries/use-work-orders';

const ACCENT = '#E11D48';

export function ManufacturingHomePage() {
  const { data: dashData, isLoading: dashLoading } = useMfgDashboard();
  const dashboard = dashData?.data;

  const recentWOs = useWorkOrders({ limit: 6 });

  return (
    <div>
      <PageHeader
        title="Manufacturing"
        description="BOMs, work orders, and production tracking."
        fullWidth
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          icon={FlaskConical}
          label="Active BOMs"
          value={String(dashboard?.activeBomCount ?? 0)}
          to="/manufacturing/boms?isActive=true"
          loading={dashLoading}
        />
        <KpiCard
          icon={ClipboardList}
          label="Draft WOs"
          value={String(dashboard?.draftWoCount ?? 0)}
          to="/manufacturing/wos?status=draft"
          loading={dashLoading}
        />
        <KpiCard
          icon={Timer}
          label="Scheduled today"
          value={String(dashboard?.scheduledTodayCount ?? 0)}
          to={`/manufacturing/wos`}
          loading={dashLoading}
        />
        <KpiCard
          icon={PlayCircle}
          label="In progress"
          value={String(dashboard?.inProgressCount ?? 0)}
          to="/manufacturing/wos?status=in_progress"
          loading={dashLoading}
          highlight
        />
      </div>

      {/* This week analytics row */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Link
          to="/manufacturing/reports/wo-pending-close"
          className="block transition-transform hover:-translate-y-0.5"
        >
          <Card>
            <CardContent>
              <div className="flex items-center gap-3">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: 'rgba(225, 29, 72, 0.10)', color: ACCENT }}
                >
                  <AlertTriangle size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                    Pending close
                  </div>
                  {dashLoading ? (
                    <Skeleton className="mt-1 h-6 w-12" />
                  ) : (
                    <div
                      className="font-mono text-lg font-semibold tabular-nums"
                      style={{ color: (dashboard?.wosCompletedPendingClose ?? 0) > 0 ? ACCENT : undefined }}
                    >
                      {dashboard?.wosCompletedPendingClose ?? 0} WOs
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Card>
          <CardContent>
            <div className="flex items-center gap-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                style={{ background: 'rgba(225, 29, 72, 0.10)', color: ACCENT }}
              >
                <TrendingUp size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                  Week variance
                </div>
                {dashLoading ? (
                  <Skeleton className="mt-1 h-6 w-16" />
                ) : (
                  <VariancePill pct={dashboard?.weekVariancePct ?? null} />
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="flex items-start gap-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                style={{ background: 'rgba(225, 29, 72, 0.10)', color: ACCENT }}
              >
                <BarChart3 size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                  Top BOMs this week
                </div>
                {dashLoading ? (
                  <div className="space-y-1">
                    {[0, 1].map((i) => <Skeleton key={i} className="h-4 w-full" />)}
                  </div>
                ) : !dashboard?.topBomsThisWeek?.length ? (
                  <p className="text-xs text-zinc-400">No runs this week</p>
                ) : (
                  <ul className="space-y-0.5">
                    {dashboard.topBomsThisWeek.slice(0, 3).map((b) => (
                      <li key={b.bomId} className="flex items-center justify-between gap-2">
                        <Link
                          to="/manufacturing/boms/$bomId"
                          params={{ bomId: b.bomId }}
                          className="min-w-0 truncate font-mono text-xs hover:underline"
                          style={{ color: ACCENT }}
                        >
                          {b.bomCode}
                        </Link>
                        <span className="shrink-0 text-xs text-zinc-500">{b.runs} runs</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <div className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-zinc-600 dark:text-zinc-400">
          Quick actions
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ActionCard icon={Plus} title="New BOM" body="Define a new recipe" to="/manufacturing/boms/new" />
          <ActionCard icon={Plus} title="New WO" body="Schedule a production run" to="/manufacturing/wos/new" />
          <ActionCard icon={FlaskConical} title="Browse BOMs" body="View all recipes" to="/manufacturing/boms" />
          <ActionCard icon={BarChart3} title="WO summary" body="View production reports" to="/manufacturing/reports/wo-summary" accent />
        </div>
      </div>

      {/* Recent WOs */}
      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">
            Recent work orders
          </h2>
          {recentWOs.data && recentWOs.data.data.length > 0 && (
            <Link
              to="/manufacturing/wos"
              className="text-xs font-medium hover:underline"
              style={{ color: ACCENT }}
            >
              View all →
            </Link>
          )}
        </div>
        <Card>
          <CardContent className="!p-0">
            {recentWOs.isLoading ? (
              <div className="space-y-2 p-4">
                {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}
              </div>
            ) : !recentWOs.data || recentWOs.data.data.length === 0 ? (
              <EmptyState
                icon={Factory}
                title="No work orders yet"
                description="Create your first work order to start tracking production runs."
              />
            ) : (
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {recentWOs.data.data.map((wo) => (
                  <li key={wo.id}>
                    <Link
                      to="/manufacturing/wos/$woId"
                      params={{ woId: wo.id }}
                      className="flex items-center gap-3 p-3 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                    >
                      <WoStatusBadge status={wo.status} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="font-mono text-sm font-semibold">{wo.woNumber}</span>
                          <span className="truncate text-sm text-zinc-700 dark:text-zinc-300">
                            {wo.bomCode}
                          </span>
                        </div>
                        <div className="mt-0.5 text-xs text-zinc-500">
                          {wo.scheduledFor}
                          {wo.shift ? ` · ${wo.shift}` : ''}
                          {` · ${wo.plannedQty} ${wo.outputItemName}`}
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon, label, value, to, loading, highlight,
}: {
  icon: typeof Factory;
  label: string; value: string; to: string;
  loading?: boolean; highlight?: boolean;
}) {
  return (
    <Link to={to as never} className="block transition-transform hover:-translate-y-0.5">
      <Card>
        <CardContent>
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                {label}
              </div>
              {loading ? (
                <Skeleton className="h-7 w-16" />
              ) : (
                <div
                  className="font-mono text-xl font-semibold tabular-nums"
                  style={{ color: highlight ? ACCENT : undefined }}
                >
                  {value}
                </div>
              )}
            </div>
            <div
              className="ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
              style={{ background: 'rgba(225, 29, 72, 0.10)', color: ACCENT }}
            >
              <Icon size={18} />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function ActionCard({ icon: Icon, title, body, to, accent }: {
  icon: typeof Factory; title: string; body: string; to: string; accent?: boolean;
}) {
  return (
    <Link
      to={to as never}
      className="group flex items-start gap-3 rounded-xl border border-zinc-200 bg-white p-3 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/50"
      style={accent ? { borderColor: 'rgba(225,29,72,0.25)' } : undefined}
    >
      <span
        className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-lg"
        style={{ background: 'rgba(225, 29, 72, 0.10)', color: ACCENT }}
      >
        <Icon size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{title}</p>
        <p className="mt-0.5 truncate text-[12px] text-zinc-500">{body}</p>
      </div>
    </Link>
  );
}

function VariancePill({ pct }: { pct: number | null }) {
  if (pct === null) {
    return <span className="text-sm text-zinc-400">No data</span>;
  }
  const isPositive = pct >= 0;
  return (
    <span
      className="font-mono text-lg font-semibold tabular-nums"
      style={{ color: isPositive ? '#16a34a' : '#dc2626' }}
    >
      {isPositive ? '+' : ''}{pct.toFixed(1)}%
    </span>
  );
}

const WO_BADGE: Record<string, { label: string; bg: string; text: string }> = {
  draft:       { label: 'DRAFT', bg: 'var(--surface-2)',              text: 'var(--text-2)' },
  in_progress: { label: 'RUN',   bg: 'rgba(234, 88, 12, 0.10)',      text: '#ea580c' },
  completed:   { label: 'DONE',  bg: 'rgba(22, 163, 74, 0.10)',      text: '#16a34a' },
  closed:      { label: 'CLSD',  bg: 'rgba(225, 29, 72, 0.10)',      text: '#e11d48' },
  cancelled:   { label: 'CXL',   bg: 'rgba(220, 38, 38, 0.08)',      text: '#dc2626' },
};

function WoStatusBadge({ status }: { status: string }) {
  const cfg = WO_BADGE[status] ?? { label: status.toUpperCase().slice(0, 4), bg: 'var(--surface-2)', text: 'var(--text-2)' };
  return (
    <span
      className="inline-flex h-9 w-14 shrink-0 items-center justify-center rounded-md text-[10px] font-bold tracking-wide"
      style={{ background: cfg.bg, color: cfg.text }}
    >
      {cfg.label}
    </span>
  );
}

