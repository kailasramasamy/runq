import { Link } from '@tanstack/react-router';
import {
  FlaskConical, Factory, ClipboardList, Plus,
  PlayCircle, Timer, TrendingUp, AlertTriangle, BarChart3, CalendarClock, Milk, Wrench,
  Recycle,
} from 'lucide-react';
import {
  PageHeader, Card, CardContent, Skeleton, EmptyState, Badge,
} from '@/components/ui';
import { useMfgDashboard } from '@/hooks/queries/use-mfg-reports';
import { useWorkOrders } from '@/hooks/queries/use-work-orders';
import { useExpiring, useOnHand, type ExpiryRow } from '@/hooks/queries/use-inventory';

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

      <InputsOnHandTile />

      <PerishablesTile />

      {/* Quick actions */}
      <div className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-zinc-600 dark:text-zinc-400">
          Quick actions
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
          <ActionCard icon={Plus} title="New BOM" body="Define a new recipe" to="/manufacturing/boms/new" />
          <ActionCard icon={Plus} title="New WO" body="Schedule a production run" to="/manufacturing/wos/new" />
          <ActionCard
            icon={Wrench}
            title="Record production"
            body="Log a run made without a WO"
            to="/manufacturing/production/new"
            accent
          />
          <ActionCard
            icon={Recycle}
            title="Reclaim stock"
            body="Put unsold goods back into raw material"
            to="/manufacturing/reclaims"
          />
          <ActionCard icon={FlaskConical} title="Browse BOMs" body="View all recipes" to="/manufacturing/boms" />
          <ActionCard icon={BarChart3} title="WO summary" body="View production reports" to="/manufacturing/reports/wo-summary" />
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

/**
 * Batches expiring today / tomorrow / already expired. Driven by the existing
 * /stock/expiring API (date-granularity is enough — perishables get a fresh
 * batch each shift, so "expires today" = today's planning trigger).
 * Hides entirely when nothing is on the clock, so non-perishable tenants
 * don't see noise.
 */
type PerishableGroup = {
  itemId: string;
  itemName: string;
  itemUnit: string | null;
  totalQty: number;
  /** FEFO-sorted: soonest expiry first. */
  batches: ExpiryRow[];
};

/**
 * Collapse expiring batches into per-item groups: batches FEFO-sorted within
 * each group, groups ordered by their soonest-expiring batch so the most
 * at-risk item sits on top.
 */
function groupPerishables(rows: ExpiryRow[]): PerishableGroup[] {
  const byItem = new Map<string, ExpiryRow[]>();
  for (const r of rows) {
    const list = byItem.get(r.itemId);
    if (list) list.push(r);
    else byItem.set(r.itemId, [r]);
  }
  return [...byItem.values()]
    .map((batches) => {
      const sorted = [...batches].sort((a, b) => a.daysToExpiry - b.daysToExpiry);
      const f = sorted[0];
      return {
        itemId: f.itemId,
        itemName: f.itemName,
        itemUnit: f.itemUnit,
        totalQty: sorted.reduce((s, b) => s + b.qty, 0),
        batches: sorted,
      };
    })
    .sort((a, b) => a.batches[0].daysToExpiry - b.batches[0].daysToExpiry);
}

function PerishablesTile() {
  const { data, isLoading } = useExpiring({ withinDays: 2, includeExpired: true });
  if (isLoading || !data || data.length === 0) return null;
  const groups = groupPerishables(data).slice(0, 5);
  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">
          Perishables on-hand
        </h2>
        <Link
          to="/inventory/reports/expiry"
          search={{ withinDays: '7', includeExpired: 'true' } as never}
          className="text-xs font-medium hover:underline"
          style={{ color: ACCENT }}
        >
          View all →
        </Link>
      </div>
      <Card>
        <CardContent className="!p-0">
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {groups.map((g) => (
              <PerishableGroupRow key={g.itemId} group={g} />
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * One item's total-on-hand + headline (soonest-batch) badge, with a per-batch
 * FEFO breakdown when more than one batch exists. The headline badge tracks
 * the SOONEST batch — the run-now signal a blended total would hide.
 */
function PerishableGroupRow({ group }: { group: PerishableGroup }) {
  const multi = group.batches.length > 1;
  const first = group.batches[0];
  return (
    <li className="p-3">
      <div className="flex items-center gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{ background: 'rgba(225, 29, 72, 0.10)', color: ACCENT }}
        >
          <CalendarClock size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-sm font-semibold">{group.itemName}</span>
            <span
              className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-white"
              style={{ background: ACCENT }}
            >
              {group.totalQty.toLocaleString()} {group.itemUnit ?? ''}
            </span>
          </div>
          <div className="mt-0.5 text-xs text-zinc-500">
            {multi
              ? `${group.batches.length} batches`
              : `${first.warehouseName}${first.batchNo ? ` · ${first.batchNo}` : ''}`}
          </div>
        </div>
        <ExpiryBadge days={first.daysToExpiry} />
        <Link
          to="/manufacturing/wos/new"
          className="ml-1 shrink-0 text-xs font-medium hover:underline"
          style={{ color: ACCENT }}
        >
          Plan WO →
        </Link>
      </div>
      {multi && (
        <ul className="mt-2 space-y-1.5 pl-12">
          {group.batches.map((b) => (
            <li
              key={`${b.warehouseId}-${b.batchNo}`}
              className="flex items-center gap-2 text-xs"
            >
              <span className="h-1 w-1 shrink-0 rounded-full bg-zinc-400" />
              <span className="shrink-0 font-medium tabular-nums">
                {b.qty.toLocaleString()} {b.itemUnit ?? ''}
              </span>
              <ExpiryBadge days={b.daysToExpiry} />
              <span className="truncate text-zinc-500">
                {b.warehouseName}{b.batchNo ? ` · ${b.batchNo}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function ExpiryBadge({ days }: { days: number }) {
  if (days < 0) return <Badge variant="danger">Expired</Badge>;
  if (days === 0) return <Badge variant="danger">Today</Badge>;
  if (days === 1) return <Badge variant="warning">Tomorrow</Badge>;
  return <Badge variant="warning">{days}d</Badge>;
}

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



/** What a BOM can actually consume today, grouped per input item with its
 *  batches. Sits above the quick actions because "can I run this?" is the
 *  question you have before writing a recipe or scheduling a run — and it was
 *  previously only answerable by leaving for the Inventory module.
 *
 *  `inputs` is the item-class group covering raw_material + packaging, so this
 *  is exactly the set a work order draws from. */
function InputsOnHandTile() {
  const { data, isLoading } = useOnHand({ itemClassGroup: 'inputs' });
  const rows = data ?? [];

  // Roll batches up per item: the BOM is written against an item, but the run
  // consumes specific batches, so both numbers matter.
  const byItem = new Map<string, {
    itemId: string; itemName: string; itemUnit: string | null;
    qty: number; value: number; batches: number; newestAt: string | null;
  }>();
  for (const r of rows) {
    const cur = byItem.get(r.itemId) ?? {
      itemId: r.itemId, itemName: r.itemName, itemUnit: r.itemUnit ?? null,
      qty: 0, value: 0, batches: 0, newestAt: null,
    };
    cur.qty += r.qty;
    cur.value += r.value;
    cur.batches += 1;
    if (r.receivedAt && (!cur.newestAt || r.receivedAt > cur.newestAt)) cur.newestAt = r.receivedAt;
    byItem.set(r.itemId, cur);
  }
  const items = [...byItem.values()].sort((a, b) => b.qty - a.qty);

  return (
    <Card className="mt-6">
      <CardContent>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
            <Milk size={15} style={{ color: ACCENT }} />
            Raw materials on hand
          </h2>
          <Link to="/inventory/stock/on-hand" className="text-xs font-medium" style={{ color: ACCENT }}>
            View all
          </Link>
        </div>
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : items.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--text-3)' }}>
            No raw materials or packaging in stock — a work order will have nothing to consume.
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((it) => (
              <div key={it.itemId} className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium" style={{ color: 'var(--text-1)' }}>
                    {it.itemName}
                  </p>
                  <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                    {it.batches} batch{it.batches === 1 ? '' : 'es'}
                    {it.newestAt ? ` · newest ${new Date(it.newestAt).toLocaleString('en-IN', {
                      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
                    })}` : ''}
                  </p>
                </div>
                <div className="whitespace-nowrap text-right">
                  <p className="text-[13px] font-semibold tabular-nums" style={{ color: 'var(--text-1)' }}>
                    {it.qty.toLocaleString('en-IN', { maximumFractionDigits: 3 })}
                    {it.itemUnit ? ` ${it.itemUnit}` : ''}
                  </p>
                  {/* Zero value is real and worth seeing: procurement milk is not
                      costed yet, so anything made from it will be under-costed. */}
                  <p className="text-[11px] tabular-nums" style={{ color: 'var(--text-3)' }}>
                    {it.value > 0
                      ? it.value.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
                      : 'not costed'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
