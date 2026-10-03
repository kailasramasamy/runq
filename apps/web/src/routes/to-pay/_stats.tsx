import { formatINRShort } from '@/lib/utils';
import { StatTile } from '@/components/ar/primitives';
import type { ToPay } from '@/hooks/queries/use-to-pay';

export function ToPayStats({ toPay }: { toPay: ToPay }) {
  if (toPay.scope === 'month') {
    const paidCount = toPay.categories.reduce((a, c) => a + c.paidCount, 0);
    const count = toPay.categories.reduce((a, c) => a + c.count, 0);
    return (
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Total (month)" value={formatINRShort(toPay.total)} sub={`${count} items`} />
        <StatTile label="Paid" value={formatINRShort(toPay.paid)} sub={`${paidCount} of ${count} paid`} tone="pos" />
        <StatTile label="Pending" value={formatINRShort(toPay.balance)} tone={toPay.balance > 0 ? 'warn' : 'neutral'} />
        <StatTile label="Overdue" value={formatINRShort(toPay.overdue)} sub={`${toPay.overdueCount} items`} tone={toPay.overdue > 0 ? 'neg' : 'neutral'} />
      </div>
    );
  }
  return (
    <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile label="Total to pay" value={formatINRShort(toPay.balance)} />
      <StatTile label="Overdue" value={formatINRShort(toPay.overdue)} sub={`${toPay.overdueCount} items`} tone={toPay.overdue > 0 ? 'neg' : 'neutral'} />
      <StatTile label="Due this week" value={formatINRShort(toPay.thisWeek)} sub={`${toPay.thisWeekCount} items`} tone={toPay.thisWeek > 0 ? 'warn' : 'neutral'} />
      <StatTile label="Later" value={formatINRShort(toPay.later)} />
    </div>
  );
}
