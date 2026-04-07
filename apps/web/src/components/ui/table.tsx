import { cn } from '@/lib/utils';
import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';

type Align = 'left' | 'center' | 'right';
const alignClasses: Record<Align, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

interface TableProps extends HTMLAttributes<HTMLTableElement> {
  noOverflow?: boolean;
}

export function Table({ className, noOverflow, children, ...props }: TableProps) {
  return (
    <div className={cn('rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900', noOverflow ? 'overflow-visible' : 'overflow-x-auto')}>
      <table className={cn('w-full border-collapse text-sm', className)} {...props}>
        {children}
      </table>
    </div>
  );
}

export function TableHeader({ className, children, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn('sticky top-0 bg-zinc-50 dark:bg-zinc-800/50', className)}
      {...props}
    >
      {children}
    </thead>
  );
}

interface ThProps extends ThHTMLAttributes<HTMLTableCellElement> {
  align?: Align;
}

export function Th({ align = 'left', className, children, ...props }: ThProps) {
  return (
    <th
      className={cn(
        'border-b border-zinc-200 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400',
        alignClasses[align],
        className,
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function TableBody({ className, children, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={cn('divide-y divide-zinc-100 dark:divide-zinc-800', className)} {...props}>
      {children}
    </tbody>
  );
}

export function TableRow({ className, children, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        'transition-colors duration-100 hover:bg-zinc-50 dark:hover:bg-zinc-800/50',
        className,
      )}
      {...props}
    >
      {children}
    </tr>
  );
}

interface TableCellProps extends TdHTMLAttributes<HTMLTableCellElement> {
  align?: Align;
  numeric?: boolean;
}

export function TableCell({ align = 'left', numeric, className, children, ...props }: TableCellProps) {
  return (
    <td
      className={cn(
        'px-4 py-3 text-zinc-900 dark:text-zinc-100',
        alignClasses[align],
        numeric && 'font-mono tabular-nums',
        className,
      )}
      {...props}
    >
      {children}
    </td>
  );
}

export function TableEmpty({ colSpan, message = 'No data available' }: { colSpan: number; message?: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
        {message}
      </td>
    </tr>
  );
}
