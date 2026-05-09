import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { formatINRShort } from '../../lib/utils';
import { Card2, Sparkline, type Tone } from './primitives';
import { useDashboardSummary, useCashTrend, type DashboardSummary } from '../../hooks/queries/use-dashboard';

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
  s: DashboardSummary | undefined,
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
    receivablesKpi(s),
    payablesKpi(s),
    burnKpi(s),
    revenueKpi(s),
  ];
}

function receivablesKpi(s: DashboardSummary | undefined): KPI {
  const value = s?.outstandingReceivables ?? 0;
  const deltaPct = s?.receivablesDeltaPct;
  // For receivables, growing balance = bad (collections lagging), shrinking = good.
  const deltaTone: Tone = deltaPct == null ? 'neutral' : deltaPct > 0 ? 'warn' : deltaPct < 0 ? 'pos' : 'neutral';
  const deltaText = deltaPct == null ? '—' : `${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(1)}%`;
  const sub = !s
    ? '—'
    : s.overdueCount > 0
      ? `${s.overdueCount} overdue`
      : 'No overdue invoices';
  return {
    label: 'Receivables',
    value,
    formatter: formatINRShort,
    delta: deltaText,
    deltaTone,
    spark: SPARK_FALLBACK,
    sparkTone: deltaTone === 'warn' ? 'warn' : 'pos',
    sub,
    hint: 'Open invoices not yet collected · vs 30 days ago',
  };
}

function payablesKpi(s: DashboardSummary | undefined): KPI {
  const value = s?.outstandingPayables ?? 0;
  const deltaPct = s?.payablesDeltaPct;
  // For payables, shrinking balance = good (paid down obligations), growing = neutral/bad.
  const deltaTone: Tone = deltaPct == null ? 'neutral' : deltaPct > 0 ? 'warn' : deltaPct < 0 ? 'pos' : 'neutral';
  const deltaText = deltaPct == null ? '—' : `${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(1)}%`;
  const sub = !s
    ? '—'
    : s.upcomingAmount > 0
      ? `${formatINRShort(s.upcomingAmount)} due in 7 days`
      : 'No bills due in 7 days';
  return {
    label: 'Payables',
    value,
    formatter: formatINRShort,
    delta: deltaText,
    deltaTone,
    spark: SPARK_FALLBACK,
    sparkTone: deltaTone === 'warn' ? 'warn' : 'pos',
    sub,
    hint: 'Bills to be paid · vs 30 days ago',
  };
}

function burnKpi(s: DashboardSummary | undefined): KPI {
  // Burn here means net cash outflow (debits − credits). Negative burn means
  // the business is generating cash, which we present as "no burn" rather than
  // a negative number — keeps the card friendly for cash-positive tenants.
  const burn = s?.netBurn30d ?? 0;
  const positiveBurn = burn > 0;
  const deltaPct = s?.netBurnDeltaPct;
  const runway = s?.runwayMonths;

  // Burn going UP is bad (red), DOWN is good (green). Inverted from revenue.
  const deltaTone: Tone = deltaPct == null ? 'neutral' : deltaPct > 0 ? 'neg' : deltaPct < 0 ? 'pos' : 'neutral';
  const deltaText = deltaPct == null ? '—' : `${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(1)}%`;

  const sub = !s
    ? '—'
    : !positiveBurn
      ? 'Cash positive — no burn'
      : runway == null
        ? 'Cash details needed for runway'
        : runway >= 24
          ? 'Runway: 24+ months'
          : `Runway: ${runway.toFixed(1)} months`;

  return {
    label: 'Net burn (30d)',
    value: positiveBurn ? burn : 0,
    formatter: formatINRShort,
    delta: deltaText,
    deltaTone,
    spark: (s?.burnSpark ?? []).length ? s!.burnSpark : SPARK_FALLBACK,
    sparkTone: positiveBurn ? 'neutral' : 'pos',
    sub,
    hint: 'Cash outflow minus inflow over the last 30 days',
  };
}

function revenueKpi(s: DashboardSummary | undefined): KPI {
  const mtd = s?.revenueMtd ?? 0;
  const priorTotal = s?.revenuePriorMonthTotal ?? 0;
  const deltaPct = s?.revenueDeltaPct;

  const deltaTone: Tone = deltaPct == null ? 'neutral' : deltaPct > 0 ? 'pos' : deltaPct < 0 ? 'neg' : 'neutral';
  const deltaText = deltaPct == null ? '—' : `${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(1)}%`;

  const sub = !s
    ? '—'
    : priorTotal > 0
      ? `vs ${formatINRShort(priorTotal)} last month`
      : 'No invoices last month';

  return {
    label: 'Revenue MTD',
    value: mtd,
    formatter: formatINRShort,
    delta: deltaText,
    deltaTone,
    spark: (s?.revenueSpark ?? []).length ? s!.revenueSpark : SPARK_FALLBACK,
    sparkTone: deltaPct != null && deltaPct < 0 ? 'neg' : 'pos',
    sub,
    hint: 'Invoiced this month (excluding drafts and cancellations)',
  };
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
