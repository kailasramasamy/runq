import { useState, ReactNode } from 'react';
import { AlertCircle, AlertTriangle, X } from 'lucide-react';

export interface AnalyticsAlert {
  id: string;
  severity: 'critical' | 'warning';
  message: string;
  ctaLabel: string;
  onCta: () => void;
}

export function AlertBanner({ alerts }: { alerts: AnalyticsAlert[] }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const visible = alerts.filter((a) => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  return (
    <div className="mb-5 space-y-2">
      {visible.map((a) => <Row key={a.id} alert={a} onDismiss={() => setDismissed((s) => new Set(s).add(a.id))} />)}
    </div>
  );
}

function Row({ alert, onDismiss }: { alert: AnalyticsAlert; onDismiss: () => void }) {
  const palette = alert.severity === 'critical'
    ? { bg: 'var(--neg-soft)',  border: 'oklch(0.87 0.07 25)', color: 'var(--neg)',  Icon: AlertCircle }
    : { bg: 'var(--warn-soft)', border: 'oklch(0.88 0.07 80)', color: 'var(--warn)', Icon: AlertTriangle };
  const Icon = palette.Icon as (props: { size: number; color?: string }) => ReactNode;

  return (
    <div
      className="flex items-center"
      style={{
        gap: 10,
        padding: '9px 14px',
        borderRadius: 9,
        background: palette.bg,
        border: `1px solid ${palette.border}`,
      }}
    >
      <Icon size={14} color={palette.color} />
      <span className="min-w-0 flex-1 truncate" style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-1)' }}>
        {alert.message}
      </span>
      <button
        type="button"
        onClick={alert.onCta}
        className="whitespace-nowrap"
        style={{ fontSize: 12, fontWeight: 600, color: palette.color }}
      >
        {alert.ctaLabel}
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="ml-1 opacity-60 transition-opacity hover:opacity-100"
        style={{ color: palette.color }}
      >
        <X size={14} />
      </button>
    </div>
  );
}
