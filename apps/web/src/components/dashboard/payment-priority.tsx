import { useNavigate } from '@tanstack/react-router';
import { Card, CardHeader, CardContent, Badge, Button } from '@/components/ui';
import { formatINR } from '@/lib/utils';
import { usePaymentPriority } from '@/hooks/queries/use-payment-priority';
import type { PrioritizedPayment } from '@/hooks/queries/use-payment-priority';

function StatusDot({ daysOverdue, daysUntilDue }: { daysOverdue: number; daysUntilDue: number }) {
  if (daysOverdue > 0) {
    return <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" />;
  }
  if (daysUntilDue <= 7) {
    return <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500" />;
  }
  return <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-green-500" />;
}

function DueLabel({ daysOverdue, daysUntilDue }: { daysOverdue: number; daysUntilDue: number }) {
  if (daysOverdue > 0) {
    return <Badge variant="danger">{daysOverdue}d overdue</Badge>;
  }
  if (daysUntilDue === 0) {
    return <Badge variant="warning">Due today</Badge>;
  }
  return <Badge variant="default">in {daysUntilDue}d</Badge>;
}

function PaymentRow({ item }: { item: PrioritizedPayment }) {
  const navigate = useNavigate();
  const amount = parseFloat(item.balanceDue) || 0;

  return (
    <div className="flex items-start gap-3 py-2.5">
      <StatusDot daysOverdue={item.daysOverdue} daysUntilDue={item.daysUntilDue} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {item.vendorName}
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {item.invoiceNumber} &middot; {item.dueDate}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <div className="text-right">
          <p className="font-mono text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
            {formatINR(amount)}
          </p>
          <DueLabel daysOverdue={item.daysOverdue} daysUntilDue={item.daysUntilDue} />
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate({ to: '/ap/payments/new' as '/' })}
          className="text-xs"
        >
          Pay
        </Button>
      </div>
    </div>
  );
}

function SummaryBar({ overdue, dueWeek, total }: { overdue: number; dueWeek: number; total: number }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-zinc-200 px-4 py-2.5 text-xs dark:border-zinc-800">
      <span>
        <span className="text-red-600 dark:text-red-400">{formatINR(overdue)}</span>{' '}
        <span className="text-zinc-500">overdue</span>
      </span>
      <span>
        <span className="text-amber-600 dark:text-amber-400">{formatINR(dueWeek)}</span>{' '}
        <span className="text-zinc-500">due this week</span>
      </span>
      <span>
        <span className="text-zinc-700 dark:text-zinc-300">{formatINR(total)}</span>{' '}
        <span className="text-zinc-500">total approved</span>
      </span>
    </div>
  );
}

export function PaymentPriorityWidget() {
  const { data, isLoading } = usePaymentPriority(8);
  const payments = data?.data ?? [];
  const summary = data?.summary;

  const overdue = parseFloat(summary?.totalOverdue ?? '0') || 0;
  const dueWeek = parseFloat(summary?.totalDueThisWeek ?? '0') || 0;
  const total = parseFloat(summary?.totalApproved ?? '0') || 0;

  return (
    <Card>
      <CardHeader title="Payment Priority" />
      {!isLoading && <SummaryBar overdue={overdue} dueWeek={dueWeek} total={total} />}
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800" />
                <div className="flex-1 space-y-1">
                  <div className="h-4 w-32 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
                  <div className="h-3 w-20 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
                </div>
              </div>
            ))}
          </div>
        ) : payments.length === 0 ? (
          <div className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
            All caught up!
          </div>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {payments.map((item) => (
              <PaymentRow key={item.invoiceId} item={item} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
