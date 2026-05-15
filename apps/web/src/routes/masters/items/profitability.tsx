import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  Package,
  Search,
  TrendingDown,
} from 'lucide-react';
import {
  PageHeader,
  Card,
  CardContent,
  CardHeader,
  Button,
  Input,
  Badge,
  StatsCard,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  Th,
  TableEmpty,
  TableSkeleton,
} from '@/components/ui';
import { formatINR } from '@/lib/utils';
import {
  useItems,
  useItemSalesAnalytics,
  type Item,
} from '@/hooks/queries/use-items';
import { calculatePricing, calculateServicePricing } from '@/lib/item-pricing';
import {
  DistributionBar,
  ProfitList,
  TIER_META,
  type ClassifiedItem,
  type ItemProfitability,
  type Tier,
} from './profitability-charts';
import { SalesAnalyticsCard } from './profitability-sales-card';

/**
 * Compute a unified profitability result for any item — service or
 * product. Services use the simpler (sellPrice - cost) model; products
 * use the MRP → margin → basic chain. Returns null when required
 * inputs are missing so the item renders as "unclassified".
 */
function computeResult(item: Item): ItemProfitability | null {
  if (item.type === 'service') {
    if (item.defaultSellingPrice == null || item.costPrice == null) return null;
    const r = calculateServicePricing({
      sellingPrice: item.defaultSellingPrice,
      cost: item.costPrice,
      gstRatePct: item.gstRate ?? 0,
    });
    return {
      basicPrice: r.basicPrice,
      profitPerUnit: r.profitPerUnit,
      netMarginPct: r.netMarginPct,
    };
  }
  // Product path — needs the full MRP chain.
  if (
    item.mrp == null ||
    item.margin == null ||
    item.gstRate == null ||
    item.costPrice == null
  ) {
    return null;
  }
  const r = calculatePricing({
    mrp: item.mrp,
    sellerMarginPct: item.margin,
    gstRatePct: item.gstRate,
    cogm: item.costPrice,
  });
  return {
    basicPrice: r.basicPrice,
    profitPerUnit: r.profitPerUnit,
    netMarginPct: r.netMarginPct,
  };
}

function classify(result: ItemProfitability | null, healthyMin: number, marginalMin: number): Tier {
  if (!result) return 'unclassified';
  if (result.netMarginPct < marginalMin) return 'loss';
  if (result.netMarginPct < healthyMin) return 'marginal';
  return 'healthy';
}

export function ItemProfitabilityPage() {
  const navigate = useNavigate();
  // Fetch all active items in one shot. Pagination cap is 500 (validators).
  const { data, isLoading } = useItems({ limit: 500 });
  const items = useMemo(
    () => (data?.data ?? []).filter((i) => i.isActive),
    [data],
  );

  const [salesPeriodDays, setSalesPeriodDays] = useState(90);
  const { data: salesAnalyticsRes } = useItemSalesAnalytics(salesPeriodDays);
  const salesAnalytics = salesAnalyticsRes?.data ?? null;

  const [healthyMin, setHealthyMin] = useState(10);
  const [marginalMin, setMarginalMin] = useState(0);
  const [tierFilter, setTierFilter] = useState<Tier | 'all'>('all');
  const [search, setSearch] = useState('');

  const classified = useMemo<ClassifiedItem[]>(
    () =>
      items.map((item) => {
        const result = computeResult(item);
        return { item, result, tier: classify(result, healthyMin, marginalMin) };
      }),
    [items, healthyMin, marginalMin],
  );

  const summary = useMemo(() => {
    const counts = { healthy: 0, marginal: 0, loss: 0, unclassified: 0 };
    let totalNetMarginSum = 0;
    let netMarginCount = 0;
    for (const c of classified) {
      counts[c.tier]++;
      if (c.result) {
        totalNetMarginSum += c.result.netMarginPct;
        netMarginCount++;
      }
    }
    return {
      total: classified.length,
      ...counts,
      avgNetMarginPct: netMarginCount > 0 ? totalNetMarginSum / netMarginCount : 0,
    };
  }, [classified]);

  // Top 10 most profitable (excluding loss makers and unclassified)
  const topProfitable = useMemo(
    () =>
      [...classified]
        .filter((c) => c.result && c.result.netMarginPct > 0)
        .sort((a, b) => (b.result!.netMarginPct - a.result!.netMarginPct))
        .slice(0, 10),
    [classified],
  );

  // Worst 10 — losses first, then thinnest margins
  const worstProfit = useMemo(
    () =>
      [...classified]
        .filter((c) => c.result)
        .sort((a, b) => a.result!.netMarginPct - b.result!.netMarginPct)
        .slice(0, 10),
    [classified],
  );

  const filtered = useMemo(() => {
    let rows = classified;
    if (tierFilter !== 'all') rows = rows.filter((c) => c.tier === tierFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((c) => {
        const brand = (c.item.attributes?.brand as string | undefined) ?? '';
        return (
          c.item.name.toLowerCase().includes(q) ||
          brand.toLowerCase().includes(q) ||
          (c.item.sku ?? '').toLowerCase().includes(q)
        );
      });
    }
    // Default sort: tier severity (loss → marginal → unclassified → healthy),
    // then net margin asc within tier so worst-first.
    const tierOrder: Record<Tier, number> = { loss: 0, marginal: 1, unclassified: 2, healthy: 3 };
    return [...rows].sort((a, b) => {
      const t = tierOrder[a.tier] - tierOrder[b.tier];
      if (t !== 0) return t;
      const am = a.result?.netMarginPct ?? -Infinity;
      const bm = b.result?.netMarginPct ?? -Infinity;
      return am - bm;
    });
  }, [classified, tierFilter, search]);

  const openItemAnalysis = (id: string) =>
    navigate({
      to: '/finance/masters/items/$itemId/analysis',
      params: { itemId: id },
      search: { from: 'list' },
    });

  return (
    <div className="space-y-4">
      <PageHeader fullWidth
        title="Profitability"
        breadcrumbs={[
          { label: 'Masters' },
          { label: 'Items', href: '/masters/items' },
          { label: 'Profitability' },
        ]}
        description="Cost vs. selling price across your catalogue. Loss-making and marginal items surface first so you can fix pricing before they bleed."
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate({ to: '/finance/masters/items' })}>
            <ArrowLeft size={14} /> Back to Items
          </Button>
        }
      />

      {/* Threshold knobs */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Input
              label="Healthy if net margin ≥"
              type="number"
              step="0.5"
              value={healthyMin}
              onChange={(e) => setHealthyMin(Number(e.target.value) || 0)}
              helper="% — adjust for your industry. 10% is a common healthy-line default."
            />
            <Input
              label="Marginal if net margin ≥"
              type="number"
              step="0.5"
              value={marginalMin}
              onChange={(e) => setMarginalMin(Number(e.target.value) || 0)}
              helper="% — anything below this counts as a loss"
            />
            <div className="flex flex-col justify-end text-xs text-zinc-500 dark:text-zinc-400">
              <p>Average net margin across the catalogue:</p>
              <p className="mt-1 font-mono text-base font-semibold text-zinc-900 dark:text-zinc-100">
                {summary.avgNetMarginPct.toFixed(2)}%
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatsCard
          title="Total Items"
          value={summary.total}
          icon={Package}
          formatValue={(v) => v.toLocaleString('en-IN')}
          onClick={() => setTierFilter('all')}
        />
        <StatsCard
          title="Healthy"
          value={summary.healthy}
          icon={CheckCircle2}
          formatValue={(v) => v.toLocaleString('en-IN')}
          className="border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/20"
          onClick={() => setTierFilter('healthy')}
        />
        <StatsCard
          title="Marginal"
          value={summary.marginal}
          icon={TrendingDown}
          formatValue={(v) => v.toLocaleString('en-IN')}
          className="border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20"
          onClick={() => setTierFilter('marginal')}
        />
        <StatsCard
          title="Loss / Risk"
          value={summary.loss}
          icon={AlertTriangle}
          formatValue={(v) => v.toLocaleString('en-IN')}
          className="border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/20"
          onClick={() => setTierFilter('loss')}
        />
      </div>

      {summary.unclassified > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-400">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <p>
            <strong>{summary.unclassified}</strong> item{summary.unclassified === 1 ? ' has' : 's have'} incomplete pricing
            (missing MRP, COGM, GST or margin) and can&apos;t be classified.
            Open them in the calculator and fill in the gaps.
          </p>
        </div>
      )}

      {/* Distribution bar */}
      <Card>
        <CardHeader title="Distribution" />
        <CardContent>
          <DistributionBar summary={summary} />
        </CardContent>
      </Card>

      {/* Top + Bottom side by side */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Top 10 Most Profitable" />
          <CardContent>
            <ProfitList items={topProfitable} variant="best" onOpen={openItemAnalysis} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Bottom 10 — Need Attention" />
          <CardContent>
            <ProfitList items={worstProfit} variant="worst" onOpen={openItemAnalysis} />
          </CardContent>
        </Card>
      </div>

      {/* Sales Analytics — pulls realised invoice data instead of the
          static item-master math the rest of this page uses. Renders only
          when the tenant has actual invoice line activity in the period;
          otherwise the empty state hints at why. */}
      <SalesAnalyticsCard
        analytics={salesAnalytics}
        periodDays={salesPeriodDays}
        onPeriodChange={setSalesPeriodDays}
        onOpenItem={openItemAnalysis}
      />

      {/* Filterable table */}
      <Card>
        <CardHeader title={`All Items (${filtered.length} of ${summary.total})`} />
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Input
                placeholder="Search by name, SKU, brand…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
              <Search size={15} className="pointer-events-none absolute mt-[-30px] ml-3 text-zinc-400" />
            </div>
            <div className="flex gap-1">
              {(['all', 'loss', 'marginal', 'healthy', 'unclassified'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTierFilter(t)}
                  className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                    tierFilter === t
                      ? 'border-indigo-400 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                      : 'border-zinc-200 text-zinc-600 hover:border-zinc-300 dark:border-zinc-700 dark:text-zinc-400'
                  }`}
                >
                  {t === 'all' ? 'All' : TIER_META[t].label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <tr>
                  <Th>Tier</Th>
                  <Th>Name</Th>
                  <Th>UOM</Th>
                  <Th>Brand</Th>
                  <Th align="right">Sell Price</Th>
                  <Th align="right">Cost</Th>
                  <Th align="right">Basic</Th>
                  <Th align="right">Profit / Unit</Th>
                  <Th align="right">Net Margin</Th>
                </tr>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableSkeleton rows={6} cols={9} />
                ) : filtered.length === 0 ? (
                  <TableEmpty colSpan={9} message="No items match these filters." />
                ) : (
                  filtered.map((c) => (
                    <TableRow
                      key={c.item.id}
                      className="cursor-pointer"
                      onClick={() => openItemAnalysis(c.item.id)}
                    >
                      <TableCell>
                        <Badge
                          variant="default"
                          className={`${TIER_META[c.tier].bg} ${TIER_META[c.tier].text} border-0`}
                        >
                          {TIER_META[c.tier].label}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{c.item.name}</TableCell>
                      <TableCell className="text-zinc-500">{c.item.unit ?? '-'}</TableCell>
                      <TableCell className="text-zinc-500">
                        {(c.item.attributes?.brand as string | undefined) ?? '-'}
                      </TableCell>
                      <TableCell align="right" numeric>
                        {c.item.type === 'service'
                          ? (c.item.defaultSellingPrice != null ? formatINR(c.item.defaultSellingPrice) : '-')
                          : (c.item.mrp != null ? formatINR(c.item.mrp) : '-')}
                      </TableCell>
                      <TableCell align="right" numeric>
                        {c.item.costPrice != null ? formatINR(c.item.costPrice) : '-'}
                      </TableCell>
                      <TableCell align="right" numeric>
                        {c.result ? formatINR(c.result.basicPrice) : '-'}
                      </TableCell>
                      <TableCell
                        align="right"
                        numeric
                        className={c.result ? TIER_META[c.tier].text : ''}
                      >
                        {c.result ? formatINR(c.result.profitPerUnit) : '-'}
                      </TableCell>
                      <TableCell
                        align="right"
                        numeric
                        className={c.result ? TIER_META[c.tier].text : ''}
                      >
                        {c.result ? `${c.result.netMarginPct.toFixed(2)}%` : '-'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


