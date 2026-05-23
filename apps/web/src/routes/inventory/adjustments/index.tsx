import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Plus, SlidersHorizontal, TrendingUp, TrendingDown, Clock } from 'lucide-react';
import {
  PageHeader, Button, Select, Table, TableHeader, TableBody, TableRow, TableCell, Th,
  TableSkeleton, EmptyState, Badge,
} from '@/components/ui';
import { useAdjustmentList } from '@/hooks/queries/use-inventory';
import { KpiStrip, formatInrShort } from '../_widgets';

const REASON_LABELS: Record<string, string> = {
  damage: 'Damage', expiry: 'Expiry', theft: 'Theft', found: 'Found',
  revaluation: 'Revaluation', correction: 'Correction', opening_balance: 'Opening',
};

export function AdjustmentListPage() {
  const [status, setStatus] = useState<'' | 'draft' | 'pending_approval' | 'posted' | 'cancelled'>('');
  const { data, isLoading } = useAdjustmentList({ status: status || undefined, limit: 100 });
  const rows = data?.data ?? [];

  const monthStart = new Date().toISOString().slice(0, 7);
  const monthPosted = rows.filter((r) => r.status === 'posted' && r.adjustmentDate?.startsWith(monthStart));
  const monthNet = monthPosted.reduce((s, r) => s + Number(r.totalValueDelta), 0);
  const monthWriteOff = monthPosted.filter((r) => Number(r.totalValueDelta) < 0)
    .reduce((s, r) => s + Number(r.totalValueDelta), 0);
  const monthGain = monthPosted.filter((r) => Number(r.totalValueDelta) > 0)
    .reduce((s, r) => s + Number(r.totalValueDelta), 0);
  const pendingApproval = rows.filter((r) => r.status === 'pending_approval').length;

  return (
    <div>
      <PageHeader
        title="Adjustments"
        description="Damage, expiry, found, revaluation — corrections to on-hand stock."
        fullWidth
        actions={
          <Link to="/inventory/adjustments/new">
            <Button variant="primary"><Plus size={16} /> New adjustment</Button>
          </Link>
        }
      />

      <KpiStrip tiles={[
        { label: 'MTD write-off', value: formatInrShort(Math.abs(monthWriteOff)), icon: TrendingDown, tone: 'danger', loading: isLoading },
        { label: 'MTD found', value: formatInrShort(monthGain), icon: TrendingUp, tone: 'success', loading: isLoading },
        { label: 'MTD net Δ', value: `${monthNet >= 0 ? '+' : '−'}${formatInrShort(Math.abs(monthNet))}`, icon: SlidersHorizontal, tone: monthNet < 0 ? 'danger' : monthNet > 0 ? 'success' : 'muted', loading: isLoading },
        { label: 'Pending approval', value: pendingApproval, icon: Clock, tone: pendingApproval > 0 ? 'warning' : 'muted', loading: isLoading },
      ]} />

      <div className="mb-4 min-w-[180px]">
        <label className="mb-1 block text-xs font-medium text-zinc-500">Status</label>
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          options={[
            { value: '', label: 'All' },
            { value: 'draft', label: 'Draft' },
            { value: 'pending_approval', label: 'Pending approval' },
            { value: 'posted', label: 'Posted' },
            { value: 'cancelled', label: 'Cancelled' },
          ]}
        />
      </div>

      {isLoading ? (
        <TableSkeleton rows={6} cols={6} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={SlidersHorizontal}
          title="No adjustments yet"
          description="Record a stock adjustment when on-hand qty needs to be corrected."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <Th>Adj #</Th>
              <Th>Date</Th>
              <Th>Warehouse</Th>
              <Th>Reason</Th>
              <Th>Status</Th>
              <Th className="text-right">Value Δ</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((a) => {
              const delta = Number(a.totalValueDelta);
              return (
                <TableRow key={a.id}>
                  <TableCell className="font-mono">
                    <Link to="/inventory/adjustments/$id" params={{ id: a.id }} className="hover:underline" style={{ color: 'var(--accent-text)' }}>
                      {a.adjNo}
                    </Link>
                  </TableCell>
                  <TableCell>{a.adjustmentDate}</TableCell>
                  <TableCell>{a.warehouseName}</TableCell>
                  <TableCell>{REASON_LABELS[a.reason] ?? a.reason}</TableCell>
                  <TableCell><StatusBadge status={a.status} /></TableCell>
                  <TableCell className="text-right tabular-nums" style={{ color: delta < 0 ? '#b91c1c' : delta > 0 ? '#15803d' : undefined }}>
                    {delta === 0 ? '—' : `${delta > 0 ? '+' : ''}₹${Math.abs(delta).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: 'draft' | 'pending_approval' | 'posted' | 'cancelled' }) {
  const m = {
    draft: ['default', 'Draft'],
    pending_approval: ['warning', 'Pending approval'],
    posted: ['success', 'Posted'],
    cancelled: ['danger', 'Cancelled'],
  } as const;
  const [v, t] = m[status];
  return <Badge variant={v}>{t}</Badge>;
}
