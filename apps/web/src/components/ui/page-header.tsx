import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useDeclarePageWidth } from '@/lib/page-width';

interface Crumb {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: Crumb[];
  className?: string;
}

// Vite's base path, stripped of trailing slash so we can concatenate
// cleanly with route paths that start with '/'. Falls back to '' when
// BASE_URL is just '/' (no subpath).
const basePath = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  return (
    <nav className={cn('flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400', className)}>
      {items.map((crumb, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight size={12} className="shrink-0" />}
          {crumb.href ? (
            <a href={`${basePath}${crumb.href}`} className="hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors duration-150">
              {crumb.label}
            </a>
          ) : (
            <span className="text-zinc-700 dark:text-zinc-200 font-medium">{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

interface PageHeaderProps {
  title: string;
  /**
   * Optional inline content rendered immediately to the right of the title.
   * Use for small labels/badges (e.g. customer nickname) that belong with
   * the heading rather than in the right-aligned actions slot.
   */
  titleBadge?: ReactNode;
  description?: string;
  breadcrumbs?: Crumb[];
  actions?: ReactNode;
  className?: string;
  /**
   * When true, the page renders edge-to-edge (no centered max-width cap).
   * Use on table-heavy pages where a 1280px cap would force premature
   * horizontal scroll. The shell reads this via the PageWidth context so
   * the decision lives next to the page's title — no central registry.
   */
  fullWidth?: boolean;
}

export function PageHeader({ title, titleBadge, description, breadcrumbs, actions, className, fullWidth }: PageHeaderProps) {
  // breadcrumbs prop accepted for back-compat but no longer rendered;
  // the topbar surfaces the active route globally.
  void breadcrumbs;
  // Tell the shell whether to drop the max-width cap. Resets on unmount.
  useDeclarePageWidth(fullWidth ? 'full' : 'capped');
  return (
    <div className={cn('mb-6', className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-semibold text-zinc-900 dark:text-zinc-100">{title}</h1>
            {titleBadge}
          </div>
          {description && (
            <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
