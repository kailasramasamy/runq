import { TrendingUp, TrendingDown } from 'lucide-react';
import type { Item } from '@/hooks/queries/use-items';
import type { PricingResult } from '@/lib/item-pricing';

export type Tier = 'healthy' | 'marginal' | 'loss' | 'unclassified';

export interface ClassifiedItem {
  item: Item;
  result: PricingResult | null;
  tier: Tier;
}

export const TIER_META: Record<Tier, { label: string; bg: string; text: string; bar: string }> = {
  healthy: {
    label: 'Healthy',
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    text: 'text-emerald-700 dark:text-emerald-400',
    bar: 'bg-emerald-500 dark:bg-emerald-600',
  },
  marginal: {
    label: 'Marginal',
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    text: 'text-amber-700 dark:text-amber-400',
    bar: 'bg-amber-500 dark:bg-amber-600',
  },
  loss: {
    label: 'Loss / Risk',
    bg: 'bg-red-50 dark:bg-red-950/30',
    text: 'text-red-700 dark:text-red-400',
    bar: 'bg-red-500 dark:bg-red-600',
  },
  unclassified: {
    label: 'Unclassified',
    bg: 'bg-zinc-50 dark:bg-zinc-900/40',
    text: 'text-zinc-600 dark:text-zinc-400',
    bar: 'bg-zinc-400 dark:bg-zinc-600',
  },
};

export function DistributionBar({
  summary,
}: {
  summary: { total: number; healthy: number; marginal: number; loss: number; unclassified: number };
}) {
  if (summary.total === 0) {
    return <p className="text-xs text-zinc-400">No items to classify yet.</p>;
  }
  const pct = (n: number) => (n / summary.total) * 100;
  const segments: Array<{ tier: Tier; count: number }> = [
    { tier: 'healthy', count: summary.healthy },
    { tier: 'marginal', count: summary.marginal },
    { tier: 'loss', count: summary.loss },
    { tier: 'unclassified', count: summary.unclassified },
  ];
  return (
    <div className="space-y-2">
      <div className="flex h-6 w-full overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800">
        {segments.map((s) => {
          if (s.count === 0) return null;
          return (
            <div
              key={s.tier}
              className={TIER_META[s.tier].bar}
              style={{ width: `${pct(s.count)}%` }}
              title={`${TIER_META[s.tier].label}: ${s.count} (${pct(s.count).toFixed(1)}%)`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3 text-xs">
        {segments.map((s) => (
          <div key={s.tier} className="flex items-center gap-1.5">
            <span className={`inline-block h-2.5 w-2.5 rounded-sm ${TIER_META[s.tier].bar}`} />
            <span className="text-zinc-600 dark:text-zinc-400">{TIER_META[s.tier].label}</span>
            <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
              {s.count}
            </span>
            <span className="text-zinc-400">({pct(s.count).toFixed(0)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProfitList({
  items,
  variant,
  onOpen,
}: {
  items: ClassifiedItem[];
  variant: 'best' | 'worst';
  onOpen: (id: string) => void;
}) {
  if (items.length === 0) {
    return (
      <p className="py-4 text-center text-xs text-zinc-400">
        {variant === 'best' ? 'No profitable items yet.' : 'No items with computed pricing.'}
      </p>
    );
  }
  // Bar width is normalised to the absolute max margin in this list
  const maxAbs = Math.max(...items.map((i) => Math.abs(i.result?.netMarginPct ?? 0)), 1);
  const Icon = variant === 'best' ? TrendingUp : TrendingDown;
  return (
    <div className="space-y-2">
      {items.map((c) => {
        const margin = c.result?.netMarginPct ?? 0;
        const width = (Math.abs(margin) / maxAbs) * 100;
        return (
          <button
            key={c.item.id}
            onClick={() => onOpen(c.item.id)}
            className="block w-full rounded-md border border-transparent px-2 py-1.5 text-left transition-colors hover:border-zinc-200 hover:bg-zinc-50 dark:hover:border-zinc-800 dark:hover:bg-zinc-900/40"
          >
            <div className="mb-1 flex items-center justify-between gap-2 text-xs">
              <div className="flex min-w-0 items-center gap-1.5">
                <Icon size={12} className={TIER_META[c.tier].text} />
                <span className="truncate font-medium text-zinc-700 dark:text-zinc-300">
                  {c.item.name}
                </span>
                {c.item.unit && (
                  <span className="shrink-0 text-zinc-500">· {c.item.unit}</span>
                )}
                {(() => {
                  const brand = (c.item.attributes?.brand as string | undefined) ?? c.item.brand;
                  return brand ? (
                    <span className="shrink-0 text-zinc-400">· {brand}</span>
                  ) : null;
                })()}
              </div>
              <span className={`font-mono font-semibold ${TIER_META[c.tier].text}`}>
                {margin.toFixed(1)}%
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
              <div
                className={`h-full ${TIER_META[c.tier].bar}`}
                style={{ width: `${width}%` }}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}
