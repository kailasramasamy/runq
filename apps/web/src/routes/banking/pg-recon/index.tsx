import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { CreditCard, Upload } from 'lucide-react';
import { usePGSettlements } from '@/hooks/queries/use-pg-recon';
import type { PGGateway, PGSettlement, PGSettlementsFilters } from '@/hooks/queries/use-pg-recon';
import { formatINR } from '@/lib/utils';
import {
  PageHeader,
  Badge,
  Button,
  Select,
  DateInput,
  Card,
  CardContent,
  Table,
  TableHeader,
  Th,
  TableBody,
  TableRow,
  TableCell,
  TableSkeleton,
  EmptyState,
  Pagination,
} from '@/components/ui';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function gatewayBadge(gateway: PGGateway) {
  const map: Record<PGGateway, { variant: 'primary' | 'info' | 'warning'; label: string }> = {
    razorpay: { variant: 'primary', label: 'Razorpay' },
    phonepe: { variant: 'info', label: 'PhonePe' },
    paytm: { variant: 'warning', label: 'Paytm' },
  };
  const { variant, label } = map[gateway] ?? { variant: 'default' as const, label: gateway };
  return <Badge variant={variant}>{label}</Badge>;
}

function settlementStatus(settlement: PGSettlement) {
  const { matchedLines, totalLines } = settlement;
  if (totalLines === 0 || matchedLines === 0) {
    return <Badge variant="default">Pending</Badge>;
  }
  if (matchedLines >= totalLines) {
    return <Badge variant="success">Reconciled</Badge>;
  }
  return <Badge variant="warning">Partial</Badge>;
}

const GATEWAY_OPTIONS = [
  { value: 'all', label: 'All Gateways' },
  { value: 'razorpay', label: 'Razorpay' },
  { value: 'phonepe', label: 'PhonePe' },
  { value: 'paytm', label: 'Paytm' },
];

const PAGE_SIZE = 20;

// ─── Component ────────────────────────────────────────────────────────────────

export function PGReconciliationPage() {
  const navigate = useNavigate();
  const [gateway, setGateway] = useState<PGGateway | 'all'>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const filters: PGSettlementsFilters = { gateway, from, to, page };
  const { data, isLoading } = usePGSettlements(filters);

  const settlements = data?.data?.data ?? [];
  const total = data?.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function handleGatewayChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setGateway(e.target.value as PGGateway | 'all');
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: 'Banking', href: '/banking' }, { label: 'PG Reconciliation' }]}
        title="PG Reconciliation"
        description="Reconcile payment gateway settlements against your books."
        actions={
          <Button onClick={() => navigate({ to: '/banking/pg-recon/import' })}>
            <Upload size={16} />
            Import Settlement
          </Button>
        }
      />

      {/* Filter row */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-44">
          <Select
            label="Gateway"
            options={GATEWAY_OPTIONS}
            value={gateway}
            onChange={handleGatewayChange}
          />
        </div>
        <div className="w-40">
          <DateInput
            label="From"
            value={from}
            onChange={(e) => { setFrom(e.target.value); setPage(1); }}
          />
        </div>
        <div className="w-40">
          <DateInput
            label="To"
            value={to}
            onChange={(e) => { setTo(e.target.value); setPage(1); }}
          />
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4">
              <TableSkeleton rows={6} cols={8} />
            </div>
          ) : settlements.length === 0 ? (
            <EmptyState
              icon={CreditCard}
              title="No settlements found"
              description="Import a PG settlement file to get started."
              action={
                <Button size="sm" onClick={() => navigate({ to: '/banking/pg-recon/import' })}>
                  <Upload size={14} />
                  Import Settlement
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <tr>
                    <Th>Settlement ID</Th>
                    <Th>Gateway</Th>
                    <Th>Date</Th>
                    <Th align="right">Gross</Th>
                    <Th align="right">Fees</Th>
                    <Th align="right">Net</Th>
                    <Th align="right">Lines</Th>
                    <Th>Status</Th>
                  </tr>
                </TableHeader>
                <TableBody>
                  {settlements.map((s) => (
                    <TableRow
                      key={s.id}
                      className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                      onClick={() => navigate({ to: `/banking/pg-recon/${s.id}` })}
                    >
                      <TableCell className="font-mono text-xs text-zinc-500">
                        {s.id.length > 16 ? `${s.id.slice(0, 16)}…` : s.id}
                      </TableCell>
                      <TableCell>{gatewayBadge(s.gateway)}</TableCell>
                      <TableCell className="text-xs text-zinc-500">{s.date}</TableCell>
                      <TableCell align="right" numeric>
                        <span className="tabular-nums">{formatINR(s.gross)}</span>
                      </TableCell>
                      <TableCell align="right" numeric>
                        <span className="tabular-nums text-red-600 dark:text-red-400">
                          {formatINR(s.fees)}
                        </span>
                      </TableCell>
                      <TableCell align="right" numeric>
                        <span className="font-medium tabular-nums">{formatINR(s.net)}</span>
                      </TableCell>
                      <TableCell align="right" numeric>
                        <span className="text-xs tabular-nums text-zinc-500">
                          {s.matchedLines}/{s.totalLines}
                        </span>
                      </TableCell>
                      <TableCell>{settlementStatus(s)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          limit={PAGE_SIZE}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
