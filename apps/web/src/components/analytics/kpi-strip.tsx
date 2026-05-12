import { ReactNode } from 'react';
import { ChevronRight, type LucideIcon } from 'lucide-react';

export interface KpiTileProps {
  label: string;
  value: ReactNode;
  sub?: string;
  icon: LucideIcon;
  tone: 'neutral' | 'accent' | 'pos' | 'neg' | 'warn';
  ctaLabel?: string;
  onCta?: () => void;
  loading?: boolean;
}

const TONE: Record<KpiTileProps['tone'], { bg: string; color: string }> = {
  neutral: { bg: 'var(--surface-2)',  color: 'var(--text-2)'    },
  accent:  { bg: 'var(--accent-soft)', color: 'var(--accent-text)' },
  pos:     { bg: 'var(--pos-soft)',    color: 'var(--pos)'       },
  neg:     { bg: 'var(--neg-soft)',    color: 'var(--neg)'       },
  warn:    { bg: 'var(--warn-soft)',   color: 'var(--warn)'      },
};

export function KpiStrip({ tiles }: { tiles: KpiTileProps[] }) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 28 }}>
      {tiles.map((t, i) => <KpiTile key={i} {...t} />)}
    </div>
  );
}

function KpiTile(p: KpiTileProps) {
  const Icon = p.icon;
  const tone = TONE[p.tone];
  return (
    <div
      className="flex flex-col"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '16px 20px',
      }}
    >
      <div className="mb-2 flex items-center gap-2.5">
        <div
          className="flex items-center justify-center"
          style={{ width: 28, height: 28, borderRadius: 8, background: tone.bg, color: tone.color }}
        >
          <Icon size={15} />
        </div>
        <span style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--text-3)' }}>{p.label}</span>
      </div>
      <div
        className="font-mono"
        style={{
          fontSize: 19,
          fontWeight: 700,
          color: 'var(--text-1)',
          letterSpacing: '-0.02em',
          minHeight: 24,
        }}
      >
        {p.loading ? <span className="inline-block h-5 w-24 animate-pulse rounded" style={{ background: 'var(--surface-2)' }} /> : p.value}
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{p.sub}</span>
        {p.ctaLabel && p.onCta && (
          <button
            type="button"
            onClick={p.onCta}
            className="inline-flex items-center gap-0.5"
            style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent-text)' }}
          >
            {p.ctaLabel}
            <ChevronRight size={12} />
          </button>
        )}
      </div>
    </div>
  );
}
