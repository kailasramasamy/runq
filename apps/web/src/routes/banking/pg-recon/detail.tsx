import { useState } from 'react';
import { CheckCircle, XCircle, CreditCard } from 'lucide-react';
import {
  usePGSettlement,
  useReconcilePGSettlement,
  usePGUnmatched,
} from '@/hooks/queries/use-pg-recon';
import type { PGGateway, PGSettlementLine } from '@/hooks/queries/use-pg-recon';
import { formatINR } from '@/lib/utils';
import { useToast } from '@/components/ui';
import {
  PageHeader,
  Badge,
  Button,
  Card,
  CardHeader,
  CardContent,
  StatsCard,
  Table,
  TableHeader,
  Th,
  TableBody,
  TableRow,
  TableCell,
  TableSkeleton,
  EmptyState,
} from '@/components/ui';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function gatewayBadge(gateway: PGGateway) {
  const map: Record<PGGateway, { variant: 'primary' | 'info' | 'warning'; label: string }> = {
    razorpay: { variant: 'primary', label: 'Razorpay' },
    phonepe: { variant: 'info', label: 'PhonePe' },
    paytm: { variant: 'warning', label: 'Paytm' },
  };
  const { variant, label } = map[gateway] ?? { variant: 'default' as const, label: gateway };
  return <Badge variant={variant} className="text-sm px-3 py-1">{label}</Badge>;
}

function lineStatusBadge(status: PGSettlementLine['status']) {
  if (status === 'matched') return <Badge variant="success">Matched</Badge>;
  if (status === 'disputed') return <Badge variant="danger">Disputed</Badge>;
  return <Badge variant="warning">Unmatched</Badge>;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SettlementLinesTable({ lines }: { lines: PGSettlementLine[] }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <tr>
            <Th>Order ID</Th>
            <Th>Transaction ID</Th>
            <Th>Date</Th>
            <Th align="right">Gross</Th>
            <Th align="right">Fee</Th>
            <Th align="right">Net</Th>
            <Th>Status</Th>
          </tr>
        </TableHeader>
        <TableBody>
          {lines.map((line) => (
            <TableRow key={line.id}>
              <TableCell className="font-mono text-xs text-zinc-500">
                {line.orderId}
              </TableCell>
              <TableCell className="font-mono text-xs text-zinc-500">
                {line.transactionId}
              </TableCell>
              <TableCell className="text-xs text-zinc-500">{line.date}</TableCell>
              <TableCell align="right" numeric>
                <span className="tabular-nums">{formatINR(line.gross)}</span>
              </TableCell>
              <TableCell align="right" numeric>
                <span className="tabular-nums text-red-600 dark:text-red-400">
                  {formatINR(line.fee)}
                </span>
              </TableCell>
              <TableCell align="right" numeric>
                <span className="font-medium tabular-nums">{formatINR(line.net)}</span>
              </TableCell>
              <TableCell>{lineStatusBadge(line.status)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

interface Props {
  settlementId: string;
}

export function PGSettlementDetailPage({ settlementId }: Props) {
  const { toast } = useToast();
  const [reconcileResult, setReconcileResult] = useState<{
    matched: number;
    unmatched: number;
    disputed: number;
  } | null>(null);

  const { data: settlementData, isLoading } = usePGSettlement(settlementId);
  const { data: unmatchedData, isLoading: unmatchedLoading } = usePGUnmatched(settlementId);
  const reconcileMutation = useReconcilePGSettlement();

  const settlement = settlementData?.data;
  const lines = settlement?.lines ?? [];
  const unmatched = unmatchedData?.data ?? [];
  const matchRate =
    settlement && settlement.totalLines > 0
      ? Math.round((settlement.matchedLines / settlement.totalLines) * 100)
      : 0;

  function handleReconcile() {
    reconcileMutation.mutate(settlementId, {
      onSuccess: (res) => {
        setReconcileResult(res.data);
        toast(
          `Reconciliation complete: ${res.data.matched} matched, ${res.data.unmatched} unmatched.`,
          'success',
        );
      },
      onError: () => toast('Reconciliation failed. Please try again.', 'error'),
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-16 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
          ))}
        </div>
        <div className="p-4">
          <TableSkeleton rows={8} cols={7} />
        </div>
      </div>
    );
  }

  if (!settlement) {
    return (
      <EmptyState
        icon={CreditCard}
        title="Settlement not found"
        description="This settlement does not exist or has been deleted."
      />
    );
  }

  const shortId =
    settlement.id.length > 20 ? `${settlement.id.slice(0, 20)}…` : settlement.id;

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: 'Banking', href: '/banking' },
          { label: 'PG Reconciliation', href: '/banking/pg-recon' },
          { label: shortId },
        ]}
        title="Settlement Detail"
        description={`${settlement.date}`}
        actions={
          <Button
            onClick={handleReconcile}
            loading={reconcileMutation.isPending}
            disabled={reconcileMutation.isPending}
          >
            <CheckCircle size={16} />
            Reconcile
          </Button>
        }
      />

      {/* Gateway badge */}
      <div className="flex items-center gap-2">
        {gatewayBadge(settlement.gateway)}
        <span className="text-sm text-zinc-500 dark:text-zinc-400">
          Settlement ID:{' '}
          <span className="font-mono text-zinc-700 dark:text-zinc-300">{settlement.id}</span>
        </span>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatsCard title="Gross Amount" value={settlement.gross} />
        <StatsCard title="Total Fees" value={settlement.fees} />
        <StatsCard title="Net Amount" value={settlement.net} />
        <StatsCard
          title="Match Rate"
          value={matchRate}
          formatValue={(v) => `${v}%`}
        />
      </div>

      {/* Reconciliation results card */}
      {reconcileResult && (
        <Card>
          <CardHeader title="Reconciliation Results" />
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center dark:border-emerald-900 dark:bg-emerald-900/20">
                <CheckCircle className="mx-auto mb-1 text-emerald-600 dark:text-emerald-400" size={20} />
                <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                  {reconcileResult.matched}
                </p>
                <p className="mt-0.5 text-xs text-emerald-600 dark:text-emerald-500">Matched</p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-center dark:border-amber-900 dark:bg-amber-900/20">
                <XCircle className="mx-auto mb-1 text-amber-600 dark:text-amber-400" size={20} />
                <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">
                  {reconcileResult.unmatched}
                </p>
                <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-500">Unmatched</p>
              </div>
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center dark:border-red-900 dark:bg-red-900/20">
                <XCircle className="mx-auto mb-1 text-red-600 dark:text-red-400" size={20} />
                <p className="text-2xl font-bold text-red-700 dark:text-red-400">
                  {reconcileResult.disputed}
                </p>
                <p className="mt-0.5 text-xs text-red-600 dark:text-red-500">Disputed</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* All settlement lines */}
      <Card>
        <CardHeader
          title="Settlement Lines"
          action={
            <Badge variant="default">
              {settlement.matchedLines}/{settlement.totalLines} matched
            </Badge>
          }
        />
        <CardContent className="p-0">
          {lines.length === 0 ? (
            <EmptyState
              icon={CreditCard}
              title="No lines available"
              description="Settlement lines will appear here once loaded."
            />
          ) : (
            <SettlementLinesTable lines={lines} />
          )}
        </CardContent>
      </Card>

      {/* Unmatched lines for manual review */}
      {unmatched.length > 0 && (
        <Card>
          <CardHeader
            title="Unmatched Lines — Manual Review Required"
            action={<Badge variant="warning">{unmatched.length} unmatched</Badge>}
          />
          <CardContent className="p-0">
            {unmatchedLoading ? (
              <div className="p-4">
                <TableSkeleton rows={4} cols={7} />
              </div>
            ) : (
              <SettlementLinesTable lines={unmatched} />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
