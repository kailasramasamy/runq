import { Link } from '@tanstack/react-router';
import {
  Boxes, PackagePlus, PackageMinus, AlertTriangle, Warehouse, CalendarClock,
  PackageX, ArrowDownToLine, ArrowUpFromLine, History, AlarmClock, BarChart3,
  Truck, MoveRight,
} from 'lucide-react';
import {
  PageHeader, Card, CardContent, CardHeader, Badge, Skeleton, EmptyState,
} from '@/components/ui';
import {
  useInventoryDashboard, useRecentActivity, useWarehouseBreakdown,
} from '@/hooks/queries/use-inventory';

export function InventoryDashboardPage() {
  const { data: k, isLoading } = useInventoryDashboard();
  const { data: recent } = useRecentActivity();
  const { data: warehouses } = useWarehouseBreakdown();

  const totalWarehouseValue = (warehouses ?? []).reduce((s, w) => s + w.totalValue, 0);

  return (
    <div>
      <PageHeader
        title="Inventory"
        description="Stock, receipts, dispatches, and reports — all in one view."
        fullWidth
      />

      {/* ── Hero stat row ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <HeroStat
          icon={Boxes}
          label="Stock value"
          value={formatInrShort(k?.totalValue ?? 0)}
          sub={k ? `${k.activeRows} stock rows` : ' '}
          loading={isLoading}
        />
        <HeroStat
          icon={PackagePlus}
          label="SKUs"
          value={String(k?.activeItems ?? 0)}
          sub="Active items"
          loading={isLoading}
        />
        <HeroStat
          icon={Warehouse}
          label="Warehouses"
          value={String(k?.warehouseCount ?? 0)}
          sub="Active locations"
          loading={isLoading}
        />
        <HeroStat
          icon={ArrowDownToLine}
          label="MTD receipts"
          value={formatInrShort(k?.monthInValue ?? 0)}
          sub={`${k?.todayGrns ?? 0} today`}
          tone="success"
          loading={isLoading}
        />
        <HeroStat
          icon={ArrowUpFromLine}
          label="MTD dispatches"
          value={formatInrShort(k?.monthOutValue ?? 0)}
          sub={`${k?.todayDeliveries ?? 0} today`}
          tone="danger"
          loading={isLoading}
        />
      </div>

      {/* ── Attention band ──────────────────────────────────────── */}
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <AttentionTile
          icon={AlertTriangle}
          count={k?.lowStockCount ?? 0}
          label="Below reorder"
          tone="warning"
          to="/inventory/reports/reorder"
          loading={isLoading}
        />
        <AttentionTile
          icon={CalendarClock}
          count={k?.expiringSoonCount ?? 0}
          label="Expiring ≤30d"
          tone="warning"
          to="/inventory/reports/expiry"
          loading={isLoading}
        />
        <AttentionTile
          icon={PackageX}
          count={k?.deadStockCount ?? 0}
          label="Dead stock 90+d"
          tone="danger"
          to="/inventory/reports/dead-stock"
          loading={isLoading}
        />
        <AttentionTile
          icon={MoveRight}
          count={k?.inTransitTransfers ?? 0}
          label="In-transit"
          tone="info"
          to="/inventory/transfers"
          loading={isLoading}
        />
      </div>

      {/* ── Two-column: actions + activity ─────────────────────── */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Quick actions */}
        <div className="lg:col-span-1">
          <h2 className="mb-3 text-sm font-semibold text-zinc-600 dark:text-zinc-400">
            Quick actions
          </h2>
          <div className="space-y-2">
            <ActionCard icon={PackagePlus} title="Receive stock" body="Create a GRN" to="/inventory/grn/new" />
            <ActionCard icon={PackageMinus} title="Dispatch stock" body="Generate a delivery note" to="/inventory/delivery/new" />
            <ActionCard icon={MoveRight} title="Transfer" body="Move stock between warehouses" to="/inventory/transfers/new" />
            <ActionCard icon={Truck} title="On-hand stock" body="Live qty + value" to="/inventory/stock/on-hand" />
            <ActionCard icon={BarChart3} title="Reports" body="Valuation, ageing, movement" to="/inventory/reports/valuation" />
          </div>
        </div>

        {/* Recent activity */}
        <div className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">
              Recent movements
            </h2>
            {recent && recent.length > 0 && (
              <Link
                to="/inventory/stock/ledger"
                className="text-xs font-medium text-primary hover:underline"
              >
                View all
              </Link>
            )}
          </div>
          <Card>
            <CardContent className="!p-0">
              {!recent ? (
                <div className="space-y-2 p-4">
                  {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}
                </div>
              ) : recent.length === 0 ? (
                <EmptyState
                  icon={History}
                  title="No movements yet"
                  description="Post a GRN to start seeing activity here."
                />
              ) : (
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {recent.slice(0, 6).map((r) => (
                    <li key={r.id} className="flex items-center gap-3 p-3">
                      <MovementBadge type={r.movementType} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{r.itemName}</div>
                        <div className="text-xs text-zinc-500">
                          {r.warehouseName} · {formatTime(r.movedAt)}
                        </div>
                      </div>
                      <div className="text-right tabular-nums">
                        {r.qtyIn > 0 && (
                          <div className="text-sm font-semibold text-green-600">
                            +{r.qtyIn.toLocaleString('en-IN', { maximumFractionDigits: 3 })}
                          </div>
                        )}
                        {r.qtyOut > 0 && (
                          <div className="text-sm font-semibold text-red-600">
                            −{r.qtyOut.toLocaleString('en-IN', { maximumFractionDigits: 3 })}
                          </div>
                        )}
                        <div className="text-[10px] uppercase tracking-wide text-zinc-500">
                          {r.itemUnit ?? ''}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Warehouse value breakdown ──────────────────────────── */}
      <div className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-zinc-600 dark:text-zinc-400">
          Value by warehouse
        </h2>
        <Card>
          <CardContent>
            {!warehouses ? (
              <Skeleton className="h-24" />
            ) : warehouses.length === 0 ? (
              <p className="text-sm text-zinc-500">No warehouses yet — add one to start.</p>
            ) : (
              <div className="space-y-3">
                {warehouses.map((w) => {
                  const pct = totalWarehouseValue > 0
                    ? (w.totalValue / totalWarehouseValue) * 100 : 0;
                  return (
                    <Link
                      key={w.id}
                      to="/inventory/warehouses/$id"
                      params={{ id: w.id }}
                      className="block rounded-lg p-2 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                    >
                      <div className="mb-1.5 flex items-baseline justify-between gap-2">
                        <div className="min-w-0">
                          <span className="text-sm font-medium">{w.name}</span>
                          <span className="ml-2 text-xs text-zinc-500">
                            {w.itemCount} {w.itemCount === 1 ? 'SKU' : 'SKUs'}
                          </span>
                        </div>
                        <span className="font-mono text-sm font-semibold tabular-nums">
                          ₹{w.totalValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.max(pct, 1)}%`,
                            background: 'var(--accent)',
                          }}
                        />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────

function HeroStat({
  icon: Icon, label, value, sub, tone = 'default', loading,
}: {
  icon: typeof Boxes; label: string; value: string; sub: string;
  tone?: 'default' | 'success' | 'danger'; loading?: boolean;
}) {
  const toneClass = tone === 'success'
    ? 'text-green-600 dark:text-green-400'
    : tone === 'danger'
      ? 'text-red-600 dark:text-red-400'
      : '';
  return (
    <Card>
      <CardContent>
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              {label}
            </div>
            {loading ? (
              <Skeleton className="h-7 w-24" />
            ) : (
              <div className={`font-mono text-xl font-semibold tabular-nums ${toneClass}`}>
                {value}
              </div>
            )}
            <div className="mt-1 truncate text-xs text-zinc-500">{sub}</div>
          </div>
          <div
            className="ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
          >
            <Icon size={18} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AttentionTile({
  icon: Icon, count, label, tone, to, loading,
}: {
  icon: typeof Boxes; count: number; label: string;
  tone: 'warning' | 'danger' | 'info'; to: string; loading?: boolean;
}) {
  const toneColors = {
    warning: { bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-400', icon: 'text-amber-600' },
    danger:  { bg: 'bg-red-50 dark:bg-red-950/30',     text: 'text-red-700 dark:text-red-400',     icon: 'text-red-600' },
    info:    { bg: 'bg-blue-50 dark:bg-blue-950/30',   text: 'text-blue-700 dark:text-blue-400',   icon: 'text-blue-600' },
  }[tone];
  const hot = count > 0;
  return (
    <Link
      to={to as never}
      className={`group flex items-center gap-3 rounded-xl border border-zinc-200 p-3 transition-colors dark:border-zinc-800 ${
        hot ? toneColors.bg : 'bg-white dark:bg-zinc-900'
      } hover:border-zinc-300 dark:hover:border-zinc-700`}
    >
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
        hot ? 'bg-white/60 dark:bg-zinc-900/60' : 'bg-zinc-50 dark:bg-zinc-800'
      } ${toneColors.icon}`}>
        <Icon size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className={`font-mono text-xl font-semibold tabular-nums ${hot ? toneColors.text : ''}`}>
          {loading ? '…' : count}
        </div>
        <div className="truncate text-xs text-zinc-500">{label}</div>
      </div>
    </Link>
  );
}

function ActionCard({
  icon: Icon, title, body, to,
}: { icon: typeof Boxes; title: string; body: string; to: string }) {
  return (
    <Link
      to={to as never}
      className="group flex items-start gap-3 rounded-xl border border-zinc-200 bg-white p-3 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/50"
    >
      <span
        className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-lg"
        style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
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

function MovementBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    grn:             { label: 'IN',  cls: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400' },
    delivery:        { label: 'OUT', cls: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400' },
    transfer_in:     { label: 'T-IN', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400' },
    transfer_out:    { label: 'T-OUT', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400' },
    adjustment_in:   { label: 'ADJ+', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400' },
    adjustment_out:  { label: 'ADJ−', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400' },
    opening:         { label: 'OPEN', cls: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400' },
    reversal:        { label: 'REV', cls: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400' },
    stock_take_in:   { label: 'ST+', cls: 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400' },
    stock_take_out:  { label: 'ST−', cls: 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400' },
  };
  const cfg = map[type] ?? { label: type.toUpperCase(), cls: 'bg-zinc-100 text-zinc-700' };
  return (
    <span className={`inline-flex h-9 w-12 shrink-0 items-center justify-center rounded-md text-[10px] font-bold tracking-wide ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

// ─── helpers ───────────────────────────────────────────────────────────

function formatInrShort(v: number): string {
  if (v >= 10_000_000) return `₹${(v / 10_000_000).toFixed(2)} Cr`;
  if (v >= 100_000) return `₹${(v / 100_000).toFixed(2)} L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(1)} K`;
  return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffH = (now.getTime() - d.getTime()) / 3_600_000;
  if (diffH < 1) return `${Math.max(1, Math.round(diffH * 60))}m ago`;
  if (diffH < 24) return `${Math.round(diffH)}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

// Use these — keep imports tidy
void AlarmClock;
