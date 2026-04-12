import { Link } from '@tanstack/react-router';
import { useGapScan } from '@/hooks/queries/use-trail';
import type { GapCategory } from '@/hooks/queries/use-trail';
import {
  PageHeader, Badge,
} from '@/components/ui';
import {
  ShieldCheck, AlertTriangle, AlertCircle, Info, CheckCircle2,
} from 'lucide-react';

const SEVERITY_CONFIG = {
  error: { icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-950/20', border: 'border-red-200 dark:border-red-800', badge: 'warning' as const },
  warning: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/20', border: 'border-amber-200 dark:border-amber-800', badge: 'warning' as const },
  info: { icon: Info, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-950/20', border: 'border-blue-200 dark:border-blue-800', badge: 'info' as const },
};

export function GapScanPage() {
  const { data, isLoading } = useGapScan();
  const result = data?.data;

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Audit' }, { label: 'Gap Scan' }]}
        title="Accounting Gap Scan"
        description="Scans your books for missing links, unposted entries, and incomplete reconciliations."
      />

      {isLoading && (
        <div className="flex items-center gap-2 py-12 justify-center text-sm text-zinc-500">
          <ShieldCheck className="h-5 w-5 animate-pulse" />
          Scanning your books...
        </div>
      )}

      {result && result.totalGaps === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">All clear</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No gaps found. Your books are complete.</p>
          <p className="text-xs text-zinc-400">Scanned at {new Date(result.scannedAt).toLocaleString('en-IN')}</p>
        </div>
      )}

      {result && result.totalGaps > 0 && (
        <div className="space-y-4">
          {/* Summary bar */}
          <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800/50">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {result.totalGaps} gap{result.totalGaps > 1 ? 's' : ''} found across {result.categories.length} categor{result.categories.length > 1 ? 'ies' : 'y'}
              </span>
            </div>
            <span className="text-xs text-zinc-400">
              Scanned at {new Date(result.scannedAt).toLocaleString('en-IN')}
            </span>
          </div>

          {/* Gap categories */}
          {result.categories.map((cat) => (
            <GapCategoryCard key={cat.title} category={cat} />
          ))}
        </div>
      )}
    </div>
  );
}

function GapCategoryCard({ category }: { category: GapCategory }) {
  const config = SEVERITY_CONFIG[category.severity];
  const Icon = config.icon;

  return (
    <div className={`rounded-lg border ${config.border} ${config.bg} overflow-hidden`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${config.color}`} />
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{category.title}</span>
          <Badge variant={config.badge}>{category.items.length}</Badge>
        </div>
      </div>
      <p className="px-4 pb-2 text-xs text-zinc-500 dark:text-zinc-400">{category.description}</p>

      {/* Items */}
      <div className="border-t border-zinc-200 dark:border-zinc-700">
        {category.items.map((item) => (
          <Link
            key={item.entityId}
            to={item.url as '/'}
            className="flex items-center justify-between gap-4 border-b border-zinc-100 px-4 py-2.5 text-sm last:border-b-0 hover:bg-white/60 dark:border-zinc-800 dark:hover:bg-zinc-800/40"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-zinc-900 dark:text-zinc-100">{item.label}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{item.summary}</p>
            </div>
            {item.date && (
              <span className="shrink-0 text-xs text-zinc-400">{item.date}</span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
