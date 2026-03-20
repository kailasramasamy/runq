import { cn } from '@/lib/utils';
import type { HTMLAttributes, ReactNode } from 'react';

export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  action?: ReactNode;
}

export function CardHeader({ title, action, className, children, ...props }: CardHeaderProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800',
        className,
      )}
      {...props}
    >
      {title ? (
        <>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
          {action && <div>{action}</div>}
        </>
      ) : (
        children
      )}
    </div>
  );
}

export function CardContent({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('p-4', className)} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'border-t border-zinc-200 px-4 py-3 dark:border-zinc-800',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
