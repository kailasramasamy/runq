import { cn } from '@/lib/utils';
import type { HTMLAttributes } from 'react';

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded bg-zinc-200 dark:bg-zinc-800', className)}
      {...props}
    />
  );
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-b border-zinc-100 dark:border-zinc-800">
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c} className="px-4 py-3">
              <Skeleton className={cn('h-4', c === 0 ? 'w-32' : 'w-24')} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900',
        className,
      )}
    >
      <Skeleton className="mb-3 h-4 w-1/3" />
      <Skeleton className="mb-2 h-3 w-full" />
      <Skeleton className="mb-2 h-3 w-5/6" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}
