import { ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { formatINR, formatINRShort } from '../../lib/utils';
import { Card2, CardTitle, Bar, type Tone } from './primitives';
import { usePayablesAging, useReceivablesAging } from '../../hooks/queries/use-dashboard';
import type { AgingData } from '../../hooks/queries/use-dashboard';

const EMPTY: AgingData = {
  total: 0,
  buckets: [
    { label: 'Current', amount: 0 },
    { label: '1–30 days', amount: 0 },
    { label: '31–60 days', amount: 0 },
    { label: '61–90 days', amount: 0 },
    { label: '90+ days', amount: 0 },
  ],
};

const BUCKET_TONES: Tone[] = ['pos', 'neutral', 'warn', 'warn', 'neg'];

function AgingCard({
  title, data, total, icon: Icon,
}: { title: string; data: AgingData; total: number; icon: LucideIcon }) {
  const max = Math.max(...data.buckets.map((b) => b.amount), 1);
  return (
    <Card2>
      <CardTitle
        icon={<Icon size={14} />}
        action={
          <span className="num text-[12px] font-semibold" style={{ color: 'var(--text-1)' }}>
            {formatINRShort(total)}
          </span>
        }
      >
        {title}
      </CardTitle>
      <div className="space-y-2.5">
        {data.buckets.map((b, i) => (
          <Bar
            key={b.label}
            label={b.label}
            amount={b.amount}
            pct={(b.amount / max) * 100}
            tone={BUCKET_TONES[i] ?? 'neutral'}
            formatAmount={formatINR}
          />
        ))}
      </div>
    </Card2>
  );
}

export function AgingBars() {
  const ar = useReceivablesAging();
  const ap = usePayablesAging();
  const arData = ar.data?.data?.buckets ? ar.data.data : EMPTY;
  const apData = ap.data?.data?.buckets ? ap.data.data : EMPTY;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <AgingCard
        title="Receivables aging"
        data={arData}
        total={arData.total}
        icon={ArrowDownToLine}
      />
      <AgingCard
        title="Payables aging"
        data={apData}
        total={apData.total}
        icon={ArrowUpFromLine}
      />
    </div>
  );
}
