// Home-screen stock strips — "Finished goods" and "Raw materials available".
// Both render the same card; only the class bucket and the empty-state copy
// differ. Rows are the most-recently-moved items in the bucket, so a
// production run or a GRN surfaces at the top immediately.

import { Link } from '@tanstack/react-router';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent, EmptyState, Skeleton } from '@/components/ui';
import { useStockHighlights, type StockHighlightRow } from '@/hooks/queries/use-inventory';

export function StockHighlightsCard({
  title, group, icon, emptyTitle, emptyBody, showValue = true,
}: {
  title: string;
  group: 'finished' | 'inputs';
  icon: LucideIcon;
  emptyTitle: string;
  emptyBody: string;
  /** Finished goods lead with value; inputs lead with the balance on hand. */
  showValue?: boolean;
}) {
  const { data: rows, isLoading } = useStockHighlights(group);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">{title}</h2>
        <Link
          to="/inventory/items"
          search={{ classGroup: group }}
          className="text-xs font-medium text-primary hover:underline"
        >
          See all
        </Link>
      </div>
      <Card>
        <CardContent className="!p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-11" />)}
            </div>
          ) : !rows || rows.length === 0 ? (
            <EmptyState icon={icon} title={emptyTitle} description={emptyBody} />
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {rows.map((r) => (
                <HighlightRow key={r.itemId} row={r} showValue={showValue} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function HighlightRow({ row, showValue }: { row: StockHighlightRow; showValue: boolean }) {
  // Below reorder is the one thing worth colouring on a raw-material list —
  // it's the difference between "we have it" and "the line stops tomorrow".
  const low = row.reorderLevel !== null && row.qty <= row.reorderLevel;
  return (
    <li>
      <Link
        to="/inventory/items/$itemId/edit"
        params={{ itemId: row.itemId }}
        className="flex items-center gap-3 p-3 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
      >
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{row.name}</div>
          {/* SKU · unit · last movement. The unit sits here rather than beside
              the figure — next to a bold quantity it read as a second number. */}
          <div className="truncate text-xs text-zinc-500">{metaLine(row)}</div>
        </div>
        <div className="text-right">
          <div
            className={`font-mono text-sm font-semibold tabular-nums ${
              low ? 'text-amber-600 dark:text-amber-400' : ''
            }`}
          >
            {row.qty.toLocaleString('en-IN', { maximumFractionDigits: 3 })}
          </div>
          <div className="text-[11px] text-zinc-500">
            {low
              ? 'Below reorder'
              : showValue
                ? `₹${row.value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
                : ''}
          </div>
        </div>
      </Link>
    </li>
  );
}

function metaLine(row: StockHighlightRow): string {
  const parts = [
    row.sku,
    row.unit,
    row.lastMovementAt ? formatWhen(row.lastMovementAt) : null,
  ].filter((p): p is string => Boolean(p));
  return parts.length > 0 ? parts.join(' · ') : '—';
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const diffH = (Date.now() - d.getTime()) / 3_600_000;
  if (diffH < 1) return `${Math.max(1, Math.round(diffH * 60))}m ago`;
  if (diffH < 24) return `${Math.round(diffH)}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}
