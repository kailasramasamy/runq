// Shared bits for the inventory module — KPI strip used above every list
// page so each surface has a one-glance summary of what's in the table.

import type { LucideIcon } from 'lucide-react';
import { Card, CardContent, Skeleton } from '@/components/ui';

export interface KpiTile {
  label: string;
  value: string | number;
  /** Optional tone — colours the number, not the card. */
  tone?: 'default' | 'success' | 'danger' | 'warning' | 'muted';
  icon?: LucideIcon;
  /** When true, renders a skeleton in place of the value. */
  loading?: boolean;
}

export function KpiStrip({ tiles }: { tiles: KpiTile[] }) {
  // Tailwind purges dynamic class names; map the supported counts statically.
  const colsClass = {
    2: 'sm:grid-cols-2',
    3: 'sm:grid-cols-3',
    4: 'sm:grid-cols-4',
  }[Math.min(Math.max(tiles.length, 2), 4) as 2 | 3 | 4];
  return (
    <div className={`mb-4 grid grid-cols-2 gap-3 ${colsClass}`}>
      {tiles.map((t, i) => (
        <Card key={i}>
          <CardContent>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                  {t.label}
                </div>
                {t.loading ? (
                  <Skeleton className="h-7 w-20" />
                ) : (
                  <div className={`font-mono text-xl font-semibold tabular-nums ${toneClass(t.tone)}`}>
                    {t.value}
                  </div>
                )}
              </div>
              {t.icon && (
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
                >
                  <t.icon size={18} />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function toneClass(tone?: KpiTile['tone']): string {
  switch (tone) {
    case 'success': return 'text-green-600 dark:text-green-400';
    case 'danger':  return 'text-red-600 dark:text-red-400';
    case 'warning': return 'text-amber-600 dark:text-amber-400';
    case 'muted':   return 'text-zinc-500';
    default:        return '';
  }
}

export function formatInrShort(v: number): string {
  if (v >= 10_000_000) return `₹${(v / 10_000_000).toFixed(2)} Cr`;
  if (v >= 100_000) return `₹${(v / 100_000).toFixed(2)} L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(1)} K`;
  return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}
