import { ReactNode } from 'react';
import { AlertCircle, ChevronRight } from 'lucide-react';

interface CardShellProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyHint?: string;
  onDrillDown?: () => void;
  drillDownLabel?: string;
  footer?: ReactNode;
  borderTone?: 'default' | 'neg';
  children?: ReactNode;
}

/**
 * Per-design card shell. Replaces the older AnalyticsCard for the redesigned
 * /finance/analytics layout. Uses the OKLCH design tokens (var(--surface) etc).
 *
 * Same prop API as AnalyticsCard so existing card components can swap with
 * a one-import change.
 */
export function CardShell({
  title,
  subtitle,
  actions,
  loading,
  error,
  empty,
  emptyHint = 'No data yet',
  onDrillDown,
  drillDownLabel = 'View all',
  footer,
  borderTone = 'default',
  children,
}: CardShellProps) {
  const borderColor = borderTone === 'neg' ? 'oklch(0.87 0.07 25)' : 'var(--border)';
  return (
    <div
      className="flex flex-col overflow-hidden transition-shadow duration-150 hover:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.08)]"
      style={{ background: 'var(--surface)', border: `1px solid ${borderColor}`, borderRadius: 12 }}
    >
      <div className="flex items-start justify-between gap-3" style={{ padding: '14px 20px 0 20px' }}>
        <div className="min-w-0">
          <h3 className="truncate" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
            {title}
          </h3>
          {subtitle && (
            <p className="truncate" style={{ fontSize: 11, marginTop: 2, color: 'var(--text-3)' }}>
              {subtitle}
            </p>
          )}
        </div>
        {actions && <div className="flex-shrink-0">{actions}</div>}
      </div>

      <div className="flex-1" style={{ padding: '12px 20px 16px 20px' }}>
        {loading ? <Skeleton /> : error ? <Err message={error} /> : empty ? <Empty hint={emptyHint} /> : children}
      </div>

      {(footer || onDrillDown) && !loading && !error && !empty && (
        <div
          className="flex items-center justify-between gap-2"
          style={{ padding: '9px 20px', borderTop: '1px solid var(--border-soft)' }}
        >
          <div className="min-w-0 flex-1 truncate" style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{footer}</div>
          {onDrillDown && (
            <button
              type="button"
              onClick={onDrillDown}
              className="inline-flex flex-shrink-0 items-center gap-0.5 whitespace-nowrap"
              style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-text)' }}
            >
              {drillDownLabel}
              <ChevronRight size={13} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-2">
      <div className="h-7 w-3/5 animate-pulse rounded" style={{ background: 'var(--surface-2)' }} />
      <div className="h-4 w-2/5 animate-pulse rounded" style={{ background: 'var(--surface-2)' }} />
      <div className="h-4 w-4/5 animate-pulse rounded" style={{ background: 'var(--surface-2)' }} />
    </div>
  );
}

function Err({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2" style={{ fontSize: 12.5, color: 'var(--neg)' }}>
      <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function Empty({ hint }: { hint: string }) {
  return <p style={{ fontSize: 12.5, color: 'var(--text-3)', fontStyle: 'italic' }}>{hint}</p>;
}
