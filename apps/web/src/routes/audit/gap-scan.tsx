import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useGapScan, useGapItems } from '@/hooks/queries/use-trail';
import type { GapCategorySummary } from '@/hooks/queries/use-trail';
import { PageHeader, Badge, Select } from '@/components/ui';
import {
  ShieldCheck, AlertTriangle, AlertCircle, CheckCircle2, ChevronDown, ChevronRight,
} from 'lucide-react';

const SEVERITY_CONFIG = {
  error: { icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-950/20', border: 'border-red-200 dark:border-red-800' },
  warning: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/20', border: 'border-amber-200 dark:border-amber-800' },
};

const DAYS_OPTIONS = [
  { value: '30', label: 'Last 30 days' },
  { value: '60', label: 'Last 60 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '180', label: 'Last 6 months' },
  { value: '365', label: 'Last 1 year' },
];

export function GapScanPage() {
  const [days, setDays] = useState(90);
  const { data, isLoading } = useGapScan(days);
  const result = data?.data;

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Audit' }, { label: 'Gap Scan' }]}
        title="Accounting Gap Scan"
        description="Scans your books for missing links, unposted entries, and incomplete reconciliations."
        actions={
          <div className="w-44">
            <Select
              options={DAYS_OPTIONS}
              value={String(days)}
              onChange={(e) => setDays(parseInt(e.target.value, 10))}
            />
          </div>
        }
      />

      {isLoading && (
        <div className="flex items-center gap-2 py-12 justify-center text-sm text-zinc-500">
          <ShieldCheck className="h-5 w-5 animate-pulse" />
          Scanning last {days} days...
        </div>
      )}

      {result && result.totalGaps === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">All clear</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No gaps found in the last {days} days.</p>
          <p className="text-xs text-zinc-400">Scanned at {new Date(result.scannedAt).toLocaleString('en-IN')}</p>
        </div>
      )}

      {result && result.totalGaps > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800/50">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {result.totalGaps} gap{result.totalGaps > 1 ? 's' : ''} found
              </span>
            </div>
            <span className="text-xs text-zinc-400">
              Last {result.daysScanned} days · {new Date(result.scannedAt).toLocaleString('en-IN')}
            </span>
          </div>

          {result.categories.map((cat) => (
            <GapCategoryRow key={cat.key} category={cat} days={days} />
          ))}
        </div>
      )}
    </div>
  );
}

function GapCategoryRow({ category, days }: { category: GapCategorySummary; days: number }) {
  const [expanded, setExpanded] = useState(false);
  const config = SEVERITY_CONFIG[category.severity];
  const Icon = config.icon;
  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <div className={`rounded-lg border ${config.border} overflow-hidden`}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={`flex w-full items-center justify-between px-4 py-3 text-left ${config.bg} hover:opacity-90`}
      >
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${config.color}`} />
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{category.title}</span>
          <Badge variant="warning">{category.count}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">{category.description}</span>
          <Chevron className="h-4 w-4 text-zinc-400" />
        </div>
      </button>
      {expanded && <GapItemsList categoryKey={category.key} days={days} />}
    </div>
  );
}

function GapItemsList({ categoryKey, days }: { categoryKey: string; days: number }) {
  const { data, isLoading } = useGapItems(categoryKey, days, true);
  const items = data?.data?.items ?? [];

  if (isLoading) {
    return <div className="px-4 py-3 text-xs text-zinc-400">Loading items...</div>;
  }

  if (items.length === 0) {
    return <div className="px-4 py-3 text-xs text-zinc-400">No items found</div>;
  }

  return (
    <div className="border-t border-zinc-200 dark:border-zinc-700">
      {items.map((item) => (
        <Link
          key={item.entityId}
          to={item.url as '/'}
          className="flex items-center justify-between gap-4 border-b border-zinc-100 px-4 py-2.5 text-sm last:border-b-0 hover:bg-white/60 dark:border-zinc-800 dark:hover:bg-zinc-800/40"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-zinc-900 dark:text-zinc-100">{item.label}</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{item.summary}</p>
          </div>
          {item.date && <span className="shrink-0 text-xs text-zinc-400">{item.date}</span>}
        </Link>
      ))}
    </div>
  );
}
