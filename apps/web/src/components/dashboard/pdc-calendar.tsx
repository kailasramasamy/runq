import { useNavigate } from '@tanstack/react-router';
import { Card, CardHeader, CardContent, Badge, Button } from '@/components/ui';
import { formatINR } from '@/lib/utils';
import { useUpcomingPDC } from '@/hooks/queries/use-cheques';

export function PDCCalendarWidget() {
  const navigate = useNavigate();
  const { data, isLoading } = useUpcomingPDC(30);
  const cheques = data?.data ?? [];

  const totalAmount = cheques.reduce((sum, c) => sum + c.amount, 0);

  return (
    <Card>
      <CardHeader
        title="Upcoming PDCs (30 days)"
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate({ to: '/banking/cheques' as '/' })}
            className="text-xs"
          >
            View all
          </Button>
        }
      />
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <div className="h-4 w-16 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
                <div className="h-4 flex-1 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
              </div>
            ))}
          </div>
        ) : cheques.length === 0 ? (
          <div className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
            No upcoming post-dated cheques
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-200 pb-2 dark:border-zinc-800">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {cheques.length} cheque{cheques.length !== 1 ? 's' : ''} upcoming
              </span>
              <span className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {formatINR(totalAmount)}
              </span>
            </div>
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {cheques.slice(0, 5).map((cheque) => (
                <div key={cheque.id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      #{cheque.chequeNumber}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {cheque.partyName ?? 'Unknown'} &middot; {cheque.chequeDate}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm tabular-nums text-zinc-900 dark:text-zinc-100">
                      {formatINR(cheque.amount)}
                    </span>
                    <Badge variant={cheque.type === 'received' ? 'success' : 'warning'}>
                      {cheque.type}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
            {cheques.length > 5 && (
              <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
                +{cheques.length - 5} more
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
