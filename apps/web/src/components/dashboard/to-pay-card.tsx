import { Link, useNavigate } from '@tanstack/react-router';
import { Card, CardHeader, CardContent } from '@/components/ui';
import { formatINR } from '@/lib/utils';
import { useToPay } from '@/hooks/queries/use-to-pay';
import { daysFrom } from '@/routes/to-pay/_shared';

export function ToPayCard() {
  const navigate = useNavigate();
  const { data } = useToPay();
  const toPay = data?.data;
  if (!toPay || toPay.balance === 0) return null;

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">To pay</h3>
        <Link to={'/finance/to-pay' as '/'} className="text-xs font-medium text-blue-600 dark:text-blue-400">
          View all
        </Link>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-x-5 gap-y-1 pb-3 text-xs text-zinc-500">
          <span><span className="font-semibold text-zinc-900 dark:text-zinc-100">{formatINR(toPay.balance)}</span> total</span>
          <span><span className="font-semibold text-red-600 dark:text-red-400">{formatINR(toPay.overdue)}</span> overdue</span>
          <span><span className="font-semibold text-zinc-900 dark:text-zinc-100">{formatINR(toPay.thisWeek)}</span> this week</span>
        </div>
        <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {toPay.items.slice(0, 3).map((i) => {
            const days = daysFrom(toPay.asOf, i.dueDate);
            return (
              <button key={`${i.category}-${i.id}`} type="button" onClick={() => navigate({ to: i.webLink as '/' })}
                className="flex w-full items-center gap-3 py-2 text-left">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{i.title}</p>
                  <p className={days < 0 ? 'text-xs text-red-600 dark:text-red-400' : 'text-xs text-zinc-500'}>
                    {days < 0 ? `${-days}d overdue` : days === 0 ? 'Due today' : `in ${days}d`}
                  </p>
                </div>
                <span className="font-mono text-sm tabular-nums text-zinc-900 dark:text-zinc-100">{formatINR(i.balance)}</span>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
