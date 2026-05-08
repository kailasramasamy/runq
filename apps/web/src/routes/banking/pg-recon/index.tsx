import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { CreditCard, Upload } from 'lucide-react';
import { usePGSettlements } from '@/hooks/queries/use-pg-recon';
import type { PGGateway, PGSettlement, PGSettlementsFilters } from '@/hooks/queries/use-pg-recon';
import { formatINR, formatINRShort } from '@/lib/utils';
import {
  PageHeader, Button, Badge, Select, StatTile,
  Table, TableHeader, Th, TableBody, TableRow, TableCell,
  Pagination, EmptyState, formatDate,
} from '@/components/ar/primitives';
import { DateInput, TableSkeleton } from '@/components/ui';

function gatewayBadge(gateway: PGGateway) {
  const map: Record<PGGateway, { variant: 'primary' | 'info' | 'warning'; label: string }> = {
    razorpay: { variant: 'primary', label: 'Razorpay' },
    phonepe: { variant: 'info', label: 'PhonePe' },
    paytm: { variant: 'warning', label: 'Paytm' },
  };
  const cfg = map[gateway] ?? { variant: 'default' as const, label: gateway };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

function settlementStatus(s: PGSettlement) {
  if (s.totalLines === 0 || s.matchedLines === 0) return <Badge variant="default">Pending</Badge>;
  if (s.matchedLines >= s.totalLines) return <Badge variant="success">Reconciled</Badge>;
  return <Badge variant="warning">Partial</Badge>;
}

const GATEWAY_OPTIONS = [
  { value: 'all', label: 'All gateways' },
  { value: 'razorpay', label: 'Razorpay' },
  { value: 'phonepe', label: 'PhonePe' },
  { value: 'paytm', label: 'Paytm' },
];

const PAGE_SIZE = 25;

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

  const grossTotal = settlements.reduce((a, s) => a + s.gross, 0);
  const feesTotal = settlements.reduce((a, s) => a + s.fees, 0);
  const netTotal = settlements.reduce((a, s) => a + s.net, 0);
  const reconciledCount = settlements.filter((s) => s.totalLines > 0 && s.matchedLines >= s.totalLines).length;

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Banking', href: '/banking/accounts' }, { label: 'PG reconciliation' }]}
        title="PG reconciliation"
        description="Reconcile payment gateway settlements (Razorpay, PhonePe, Paytm) against your books."
        actions={
          <Button size="sm" icon={<Upload size={13} />} onClick={() => navigate({ to: '/banking/pg-recon/import' })}>
            Import settlement
          </Button>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Settlements" value={total} sub={`${reconciledCount} reconciled in view`} />
        <StatTile label="Gross" value={formatINRShort(grossTotal)} sub="In view" />
        <StatTile label="Fees" value={formatINRShort(feesTotal)} sub="Gateway charges" tone="neg" />
        <StatTile label="Net settled" value={formatINRShort(netTotal)} sub="To bank" tone="pos" />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select
          options={GATEWAY_OPTIONS}
          value={gateway}
          onChange={(e) => { setGateway(e.target.value as PGGateway | 'all'); setPage(1); }}
        />
        <div className="w-40">
          <DateInput value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} placeholder="From" />
        </div>
        <div className="w-40">
          <DateInput value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} placeholder="To" />
        </div>
        <div className="flex-1" />
        <span className="num text-[12px]" style={{ color: 'var(--text-3)' }}>{total} settlements</span>
      </div>

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
          {isLoading ? (
            <TableSkeleton rows={6} cols={8} />
          ) : settlements.length === 0 ? (
            <tr>
              <td colSpan={8}>
                <EmptyState
                  icon={<CreditCard size={18} />}
                  title="No settlements found"
                  description="Import a PG settlement file to get started."
                  action={(
                    <Button size="sm" icon={<Upload size={13} />} onClick={() => navigate({ to: '/banking/pg-recon/import' })}>
                      Import settlement
                    </Button>
                  )}
                />
              </td>
            </tr>
          ) : settlements.map((s) => (
            <TableRow
              key={s.id}
              onClick={() => navigate({ to: `/banking/pg-recon/${s.id}` as never })}
            >
              <TableCell numeric style={{ color: 'var(--text-2)' }}>
                {s.id.length > 16 ? `${s.id.slice(0, 16)}…` : s.id}
              </TableCell>
              <TableCell>{gatewayBadge(s.gateway)}</TableCell>
              <TableCell numeric style={{ color: 'var(--text-2)' }}>{formatDate(s.date)}</TableCell>
              <TableCell align="right" numeric>{formatINR(s.gross)}</TableCell>
              <TableCell align="right" numeric><span style={{ color: 'var(--neg)' }}>{formatINR(s.fees)}</span></TableCell>
              <TableCell align="right" numeric className="font-semibold">{formatINR(s.net)}</TableCell>
              <TableCell align="right" numeric style={{ color: 'var(--text-3)' }}>
                {s.matchedLines}/{s.totalLines}
              </TableCell>
              <TableCell>{settlementStatus(s)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {totalPages > 1 && (
        <div className="mt-3">
          <Pagination page={page} totalPages={totalPages} total={total} limit={PAGE_SIZE} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}
