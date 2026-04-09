import { Badge, Card, CardContent, CardHeader } from '@/components/ui';
import { formatINR } from '@/lib/utils';
import type { SalesAnalyticsResult, SalesAnalyticsRow } from '@/hooks/queries/use-items';

// ─── Sales Analytics Card ────────────────────────────────────────────────────
//
// Pulls realised invoice line data (last 30/90/180/365 days) instead of the
// static item-master pricing math the rest of the Profitability page uses.
// Three views:
//   - Revenue mix (product vs service split)
//   - Top 5 items by gross revenue
//   - Top 5 items by margin %
//
// Renders an empty state when the tenant has no qualifying invoice
// activity, so a brand-new tenant doesn't see broken/blank panels.

const PERIOD_OPTIONS = [
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
  { value: 180, label: 'Last 180 days' },
  { value: 365, label: 'Last 365 days' },
];

export function SalesAnalyticsCard({
  analytics,
  periodDays,
  onPeriodChange,
  onOpenItem,
}: {
  analytics: SalesAnalyticsResult | null;
  periodDays: number;
  onPeriodChange: (days: number) => void;
  onOpenItem: (id: string) => void;
}) {
  const totalRevenue = analytics
    ? analytics.revenueMix.product + analytics.revenueMix.service
    : 0;
  const productPct = totalRevenue > 0 ? (analytics!.revenueMix.product / totalRevenue) * 100 : 0;
  const servicePct = totalRevenue > 0 ? (analytics!.revenueMix.service / totalRevenue) * 100 : 0;

  return (
    <Card>
      <CardHeader title="Sales Analytics — based on actual invoice activity" />
      <CardContent className="space-y-4 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Revenue and profit rolled up from sales invoices, not the static item master.
            Drafts and cancelled invoices are excluded.
          </p>
          <select
            value={periodDays}
            onChange={(e) => onPeriodChange(Number(e.target.value))}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 focus:border-indigo-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          >
            {PERIOD_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {analytics === null || totalRevenue === 0 ? (
          <div className="rounded-md border border-dashed border-zinc-300 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
            No sales activity in this period yet. Once you start issuing invoices, this panel will show your top earners.
          </div>
        ) : (
          <>
            {/* Revenue mix */}
            <div className="rounded-md border border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="font-medium text-zinc-600 dark:text-zinc-400">Revenue mix</span>
                <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                  {formatINR(totalRevenue)}
                </span>
              </div>
              <div className="flex h-6 w-full overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800">
                {analytics.revenueMix.product > 0 && (
                  <div
                    className="bg-indigo-500 dark:bg-indigo-600"
                    style={{ width: `${productPct}%` }}
                    title={`Products: ${formatINR(analytics.revenueMix.product)} (${productPct.toFixed(1)}%)`}
                  />
                )}
                {analytics.revenueMix.service > 0 && (
                  <div
                    className="bg-emerald-500 dark:bg-emerald-600"
                    style={{ width: `${servicePct}%` }}
                    title={`Services: ${formatINR(analytics.revenueMix.service)} (${servicePct.toFixed(1)}%)`}
                  />
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-indigo-500 dark:bg-indigo-600" />
                  <span className="text-zinc-600 dark:text-zinc-400">Products</span>
                  <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                    {formatINR(analytics.revenueMix.product)}
                  </span>
                  <span className="text-zinc-400">({productPct.toFixed(0)}%)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500 dark:bg-emerald-600" />
                  <span className="text-zinc-600 dark:text-zinc-400">Services</span>
                  <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                    {formatINR(analytics.revenueMix.service)}
                  </span>
                  <span className="text-zinc-400">({servicePct.toFixed(0)}%)</span>
                </div>
              </div>
            </div>

            {/* Top by revenue / Top by margin side by side */}
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Top by revenue
                </p>
                <SalesAnalyticsList
                  rows={analytics.topByRevenue.slice(0, 5)}
                  metric="revenue"
                  onOpen={onOpenItem}
                />
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Top by margin
                </p>
                <SalesAnalyticsList
                  rows={analytics.topByMargin.slice(0, 5)}
                  metric="margin"
                  onOpen={onOpenItem}
                />
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function SalesAnalyticsList({
  rows,
  metric,
  onOpen,
}: {
  rows: SalesAnalyticsRow[];
  metric: 'revenue' | 'margin';
  onOpen: (id: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <p className="py-3 text-center text-xs text-zinc-400">
        {metric === 'margin' ? 'No items have a cost price set yet.' : 'No items sold in this period.'}
      </p>
    );
  }
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <button
          key={r.itemId}
          onClick={() => onOpen(r.itemId)}
          className="flex w-full items-center justify-between gap-3 rounded-md border border-transparent px-2 py-1.5 text-left text-xs transition-colors hover:border-zinc-200 hover:bg-zinc-50 dark:hover:border-zinc-800 dark:hover:bg-zinc-900/40"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium text-zinc-700 dark:text-zinc-300">
                {r.name}
              </span>
              <Badge variant={r.type === 'service' ? 'success' : 'info'}>{r.type}</Badge>
            </div>
            <p className="text-[10px] text-zinc-400">
              {r.quantity.toLocaleString('en-IN', { maximumFractionDigits: 2 })} {r.unit ?? 'units'}
              {' · '}{formatINR(r.revenue)}
            </p>
          </div>
          <span className="shrink-0 font-mono font-semibold text-zinc-900 dark:text-zinc-100">
            {metric === 'revenue'
              ? formatINR(r.revenue)
              : r.marginPct != null
              ? `${r.marginPct.toFixed(1)}%`
              : '—'}
          </span>
        </button>
      ))}
    </div>
  );
}
