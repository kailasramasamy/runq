import { useState, useMemo } from 'react';
import { LineChart, ArrowRight } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { formatINRShort } from '../../lib/utils';
import { Card2 } from './primitives';
import { useCashflowForecast } from '../../hooks/queries/use-dashboard';

const RANGES = ['3M', '6M', 'YTD'] as const;

export function CashflowForecast() {
  const navigate = useNavigate();
  const [range, setRange] = useState<typeof RANGES[number]>('6M');
  const { data, isLoading } = useCashflowForecast();

  const allMonths = data?.data.months ?? [];
  const forecastMonths = allMonths.filter((m) => m.forecast).length;

  const months = useMemo(() => {
    if (range === '3M') return allMonths.slice(-6);
    if (range === 'YTD') {
      const year = new Date().getFullYear();
      return allMonths.filter((m) => m.ym.startsWith(String(year)));
    }
    return allMonths;
  }, [allMonths, range]);

  const max = Math.max(1, ...months.flatMap((m) => [m.in, m.out]));

  const inflow90 = data?.data.inflow90 ?? 0;
  const outflow90 = data?.data.outflow90 ?? 0;
  const net90 = data?.data.net90 ?? 0;

  return (
    <Card2>
      {/* Header */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border"
            style={{
              background: 'var(--surface-2)',
              borderColor: 'var(--border)',
              color: 'var(--text-2)',
            }}
          >
            <LineChart size={14} />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold tracking-tight" style={{ color: 'var(--text-1)' }}>
              Cash flow forecast
            </h3>
            <p className="mt-0.5 text-[11.5px]" style={{ color: 'var(--text-3)' }}>
              Last 6 months
              {forecastMonths > 0 && ` + ${forecastMonths}-month AI projection`}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3 text-[11px]">
          <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--text-2)' }}>
            <span className="h-2 w-2 rounded-sm" style={{ background: 'var(--pos)' }} />
            In
          </span>
          <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--text-2)' }}>
            <span className="h-2 w-2 rounded-sm" style={{ background: 'var(--neg)' }} />
            Out
          </span>
          <span className="hidden sm:inline" style={{ color: 'var(--border)' }}>·</span>
          <button
            onClick={() => navigate({ to: '/reports' })}
            className="inline-flex items-center gap-1 font-medium hover:underline"
            style={{ color: 'var(--accent-text)' }}
          >
            Open forecast <ArrowRight size={11} />
          </button>
          <span className="hidden sm:inline" style={{ color: 'var(--border)' }}>·</span>
          <div
            className="hidden items-center rounded-md border p-0.5 sm:inline-flex"
            style={{ borderColor: 'var(--border)' }}
          >
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className="rounded px-2 py-0.5 text-[11px] font-medium"
                style={{
                  background: r === range ? 'var(--surface-2)' : 'transparent',
                  color: r === range ? 'var(--text-1)' : 'var(--text-3)',
                }}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <SummaryTile
          label="Forecast inflow (90D)"
          value={formatINRShort(inflow90)}
          tone="pos"
        />
        <SummaryTile
          label="Forecast outflow (90D)"
          value={formatINRShort(outflow90)}
          tone="neg"
        />
        <SummaryTile
          label="Projected net"
          value={`${net90 >= 0 ? '+' : ''}${formatINRShort(net90)}`}
          tone="accent"
        />
      </div>

      {/* Chart */}
      {isLoading ? (
        <div className="h-44 animate-pulse rounded" style={{ background: 'var(--surface-2)' }} />
      ) : months.length === 0 ? (
        <div className="flex h-44 items-center justify-center text-[12px]" style={{ color: 'var(--text-3)' }}>
          Not enough data yet — record a few transactions to see your cash flow.
        </div>
      ) : (
        <div className="flex h-44 gap-2 pt-2">
          {months.map((m) => {
            const hIn = (m.in / max) * 100;
            const hOut = (m.out / max) * 100;
            return (
              <div key={m.ym} className="group flex h-full flex-1 flex-col items-center gap-1">
                <div
                  className="relative flex w-full flex-1 items-end justify-center gap-0.5"
                  title={`${m.label} · in ${formatINRShort(m.in)} · out ${formatINRShort(m.out)}`}
                >
                  <div
                    className="w-1/2 rounded-t"
                    style={{
                      height: `${hIn}%`,
                      background: m.forecast ? 'transparent' : 'var(--pos)',
                      border: m.forecast ? `1.5px dashed var(--pos)` : 'none',
                      opacity: m.forecast ? 0.7 : 1,
                    }}
                  />
                  <div
                    className="w-1/2 rounded-t"
                    style={{
                      height: `${hOut}%`,
                      background: m.forecast ? 'transparent' : 'var(--neg)',
                      border: m.forecast ? `1.5px dashed var(--neg)` : 'none',
                      opacity: m.forecast ? 0.7 : 1,
                    }}
                  />
                </div>
                <span
                  className="text-[10px]"
                  style={{ color: m.forecast ? 'var(--text-3)' : 'var(--text-2)' }}
                >
                  {m.label}{m.forecast && '*'}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-3 text-[10.5px]" style={{ color: 'var(--text-3)' }}>
        * Forecast generated by runQ Agent — based on recurring patterns, AR aging, and PDC schedule
      </div>
    </Card2>
  );
}

function SummaryTile({
  label, value, tone,
}: {
  label: string;
  value: string;
  tone: 'pos' | 'neg' | 'accent';
}) {
  const fg: Record<typeof tone, string> = {
    pos: 'var(--pos)',
    neg: 'var(--neg)',
    accent: 'var(--accent-text)',
  };
  const bg: Record<typeof tone, string> = {
    pos: 'var(--surface-2)',
    neg: 'var(--surface-2)',
    accent: 'var(--accent-soft)',
  };
  const border: Record<typeof tone, string> = {
    pos: 'var(--border)',
    neg: 'var(--border)',
    accent: 'color-mix(in oklab, var(--accent) 20%, transparent)',
  };
  return (
    <div
      className="rounded-lg border px-3.5 py-2.5"
      style={{ background: bg[tone], borderColor: border[tone] }}
    >
      <div
        className="text-[10px] font-medium uppercase tracking-wider"
        style={{ color: 'var(--text-3)' }}
      >
        {label}
      </div>
      <div
        className="num mt-1 text-[20px] font-semibold tabular-nums leading-none"
        style={{ color: fg[tone] }}
      >
        {value}
      </div>
    </div>
  );
}
