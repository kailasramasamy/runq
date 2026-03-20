import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
  className?: string;
}

function getPageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, '...', total];
  if (current >= total - 3) return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
  return [1, '...', current - 1, current, current + 1, '...', total];
}

export function Pagination({ page, totalPages, total, limit, onPageChange, className }: PaginationProps) {
  const start = Math.min((page - 1) * limit + 1, total);
  const end = Math.min(page * limit, total);
  const pages = getPageNumbers(page, totalPages);

  const btnBase = 'inline-flex h-8 w-8 items-center justify-center rounded text-sm transition-colors duration-150 disabled:pointer-events-none disabled:opacity-40';
  const btnActive = 'bg-indigo-600 text-white dark:bg-indigo-500';
  const btnInactive = 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800';

  return (
    <div className={cn('flex items-center justify-between gap-4 px-1', className)}>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Showing <span className="font-medium text-zinc-900 dark:text-zinc-100">{start}–{end}</span> of{' '}
        <span className="font-medium text-zinc-900 dark:text-zinc-100">{total}</span> results
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          className={cn(btnBase, btnInactive)}
          aria-label="Previous page"
        >
          <ChevronLeft size={16} />
        </button>
        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`ellipsis-${i}`} className="flex h-8 w-8 items-center justify-center text-sm text-zinc-400">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p as number)}
              className={cn(btnBase, p === page ? btnActive : btnInactive)}
            >
              {p}
            </button>
          ),
        )}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
          className={cn(btnBase, btnInactive)}
          aria-label="Next page"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
