import { useNavigate } from '@tanstack/react-router';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardHeader, CardContent, Badge, Button } from '@/components/ui';
import { formatINR } from '@/lib/utils';
import { api } from '@/lib/api-client';

interface Anomaly {
  invoiceId: string;
  invoiceNumber: string;
  vendorName: string;
  amount: number;
  anomalyType: string;
  reason: string;
  severity: 'high' | 'medium';
}

function useExpenseAnomalies() {
  return useQuery({
    queryKey: ['ap', 'anomalies'],
    queryFn: () => api.get<{ data: Anomaly[] }>('/ap/purchase-invoices/anomalies'),
    staleTime: 120_000,
  });
}

function AnomalyRow({ item }: { item: Anomaly }) {
  const navigate = useNavigate();
  const colorClass = item.severity === 'high'
    ? 'text-red-500 dark:text-red-400'
    : 'text-amber-500 dark:text-amber-400';

  return (
    <div className="flex items-start gap-3 py-2.5">
      <AlertTriangle size={16} className={`mt-0.5 shrink-0 ${colorClass}`} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {item.vendorName}
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {item.invoiceNumber} &middot; {formatINR(item.amount)}
        </p>
        <p className={`mt-0.5 text-xs ${colorClass}`}>{item.reason}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Badge variant={item.severity === 'high' ? 'danger' : 'warning'}>
          {item.severity}
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate({ to: `/ap/bills/${item.invoiceId}` as '/' })}
          className="text-xs"
        >
          View
        </Button>
      </div>
    </div>
  );
}

export function ExpenseAlertsWidget() {
  const { data, isLoading } = useExpenseAnomalies();
  const anomalies = data?.data ?? [];

  return (
    <Card>
      <CardHeader
        title="Expense Alerts"
        action={
          anomalies.length > 0 ? (
            <Badge variant="danger">{anomalies.length}</Badge>
          ) : undefined
        }
      />
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <div className="h-4 w-4 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
                <div className="flex-1 space-y-1">
                  <div className="h-4 w-32 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
                  <div className="h-3 w-48 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
                </div>
              </div>
            ))}
          </div>
        ) : anomalies.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <CheckCircle size={24} className="text-green-500" />
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No anomalies detected</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {anomalies.map((item) => (
              <AnomalyRow key={item.invoiceId} item={item} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
