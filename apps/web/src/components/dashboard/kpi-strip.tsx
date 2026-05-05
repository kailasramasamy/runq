import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { formatINRShort } from '../../lib/utils';
import { Card2, Sparkline, type Tone } from './primitives';
import { useDashboardSummary, useCashTrend } from '../../hooks/queries/use-dashboard';

type KPI = {
  label: string;
  value: number;
  formatter?: (n: number) => string;
  delta: string;
  deltaTone: Tone;
  spark: number[];
  sparkTone: Tone;
  sub: string;
  hint: string;
};

const SPARK_FALLBACK = [3, 5, 4, 6, 5, 7, 6, 8, 7, 9, 8, 10];

function buildKpis(
  s: {
    cashPosition: number;
    outstandingReceivables: number;
    outstandingPayables: number;
    overdueAmount: number;
    overdueCount: number;
    upcomingAmount: number;
    upcomingCount: number;
  } | undefined,
  trend: { spark: number[]; weeklyDelta: number; cashPosition: number } | undefined,
): KPI[] {
  const cashSpark = trend?.spark && trend.spark.length >= 2 ? trend.spark : SPARK_FALLBACK;
  const cashStart = cashSpark[0] ?? 0;
  const cashNow = trend?.cashPosition ?? s?.cashPosition ?? 0;
  const cashPct = cashStart > 0 ? ((cashNow - cashStart) / cashStart) * 100 : 0;
  const cashDeltaTone: Tone = cashPct > 0 ? 'pos' : cashPct < 0 ? 'neg' : 'neutral';
  const cashSparkTone: Tone = cashPct >= 0 ? 'pos' : 'neg';

  return [
    {
      label: 'Cash position',
      value: cashNow,
      formatter: formatINRShort,
      delta: `${cashPct >= 0 ? '+' : ''}${cashPct.toFixed(1)}%`,
      deltaTone: cashDeltaTone,
      spark: cashSpark,
      sparkTone: cashSparkTone,
      sub: trend ? `Last ${trend.spark.length} days` : 'Across all accounts',
      hint: 'Sum of all bank account balances',
    },
    {
      label: 'Receivables',
      value: s?.outstandingReceivables ?? 2814200,
      formatter: formatINRShort,
      delta: '−3.1%',
      deltaTone: 'warn',
      spark: [5, 7, 6, 8, 9, 7, 6, 5, 6, 7, 6, 5],
      sparkTone: 'warn',
      sub: s ? `${s.overdueCount} overdue` : '₹4.2L overdue · 18 invoices',
      hint: 'Open invoices not yet collected',
    },
    {
      label: 'Payables',
      value: s?.outstandingPayables ?? 1142800,
      formatter: formatINRShort,
      delta: '−8.4%',
      deltaTone: 'neg',
      spark: [9, 8, 7, 8, 6, 7, 5, 6, 5, 4, 5, 4],
      sparkTone: 'neg',
      sub: s ? `${formatINRShort(s.upcomingAmount)} due in 7 days` : '₹62k due in 7 days',
      hint: 'Bills to be paid',
    },
    {
      label: 'Net burn (30d)',
      value: 412300,
      formatter: formatINRShort,
      delta: '+2.4%',
      deltaTone: 'neutral',
      spark: [4, 5, 4, 5, 4, 5, 4, 5, 4, 5, 4, 5],
      sparkTone: 'neutral',
      sub: 'Runway: 10.4 months',
      hint: 'Cash outflow minus inflow',
    },
    {
      label: 'Revenue MTD',
      value: 1820000,
      formatter: formatINRShort,
      delta: '+14.3%',
      deltaTone: 'pos',
      spark: [3, 4, 3, 5, 4, 6, 5, 7, 6, 8, 7, 9],
      sparkTone: 'pos',
      sub: 'vs ₹15.9L last month',
      hint: 'Revenue this month so far',
    },
  ];
}

const DELTA_COLOR: Record<Tone, string> = {
  pos: 'var(--pos)',
  neg: 'var(--neg)',
  warn: 'var(--warn)',
  neutral: 'var(--text-3)',
  accent: 'var(--accent-text)',
};

export function KpiStrip() {
  const summary = useDashboardSummary();
  const trend = useCashTrend(30);
  const kpis = buildKpis(summary.data?.data, trend.data?.data);

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      {kpis.map((k) => {
        const DeltaIcon =
          k.deltaTone === 'pos' ? TrendingUp :
          k.deltaTone === 'neg' || k.deltaTone === 'warn' ? TrendingDown : Minus;
        return (
          <Card2 key={k.label} className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <span
                className="text-[10px] font-semibold uppercase tracking-[0.08em]"
                style={{ color: 'var(--text-3)' }}
              >
                {k.label}
              </span>
              <span
                className="num inline-flex items-center gap-0.5 text-[11px] font-semibold"
                style={{ color: DELTA_COLOR[k.deltaTone] }}
              >
                <DeltaIcon size={11} />
                {k.delta}
              </span>
            </div>
            <div
              className="num text-[22px] font-semibold leading-tight"
              style={{ color: 'var(--text-1)' }}
            >
              {k.formatter ? k.formatter(k.value) : k.value}
            </div>
            <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>{k.sub}</div>
            <div className="mt-auto">
              <Sparkline
                values={k.spark}
                tone={k.sparkTone}
                width={200}
                height={40}
                responsive
                fill
                endDot
              />
            </div>
          </Card2>
        );
      })}
    </div>
  );
}
