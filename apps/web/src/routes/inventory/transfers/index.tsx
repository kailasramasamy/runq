import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Plus, MoveRight, Plane, CheckCircle2, IndianRupee } from 'lucide-react';
import {
  PageHeader, Button, Select, Table, TableHeader, TableBody, TableRow, TableCell, Th,
  TableSkeleton, EmptyState, Badge,
} from '@/components/ui';
import { useTransferList } from '@/hooks/queries/use-inventory';
import { KpiStrip, formatInrShort } from '../_widgets';

export function TransferListPage() {
  const [status, setStatus] = useState<'' | 'draft' | 'in_transit' | 'received' | 'cancelled'>('');
  const { data, isLoading } = useTransferList({ status: status || undefined, limit: 100 });
  const rows = data?.data ?? [];

  const inTransit = rows.filter((r) => r.status === 'in_transit');
  const receivedCount = rows.filter((r) => r.status === 'received').length;
  const inTransitValue = inTransit.reduce((s, r) => s + Number(r.totalValue), 0);

  return (
    <div>
      <PageHeader
        title="Transfers"
        description="Move stock between warehouses with an in-transit handover."
        fullWidth
        actions={
          <Link to="/inventory/transfers/new">
            <Button variant="primary"><Plus size={16} /> New transfer</Button>
          </Link>
        }
      />

      <KpiStrip tiles={[
        { label: 'In view', value: rows.length, icon: MoveRight, loading: isLoading },
        { label: 'In transit', value: inTransit.length, icon: Plane, tone: inTransit.length > 0 ? 'warning' : 'muted', loading: isLoading },
        { label: 'Received', value: receivedCount, icon: CheckCircle2, tone: 'success', loading: isLoading },
        { label: 'In-transit value', value: formatInrShort(inTransitValue), icon: IndianRupee, loading: isLoading },
      ]} />

      <div className="mb-4 min-w-[180px]">
        <label className="mb-1 block text-xs font-medium text-zinc-500">Status</label>
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          options={[
            { value: '', label: 'All' },
            { value: 'draft', label: 'Draft' },
            { value: 'in_transit', label: 'In transit' },
            { value: 'received', label: 'Received' },
            { value: 'cancelled', label: 'Cancelled' },
          ]}
        />
      </div>

      {isLoading ? (
        <TableSkeleton rows={6} cols={6} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={MoveRight}
          title="No transfers yet"
          description="Use a transfer when stock physically moves between two warehouses."
          action={<Link to="/inventory/transfers/new"><Button variant="primary"><Plus size={16} /> New transfer</Button></Link>}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <Th>Transfer #</Th>
              <Th>From</Th>
              <Th>To</Th>
              <Th>Status</Th>
              <Th>Created</Th>
              <Th className="text-right">Value</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-mono">
                  <Link
                    to="/inventory/transfers/$id"
                    params={{ id: t.id }}
                    className="hover:underline"
                    style={{ color: 'var(--accent-text)' }}
                  >
                    {t.transferNo}
                  </Link>
                </TableCell>
                <TableCell>{t.fromWarehouseName}</TableCell>
                <TableCell>{t.toWarehouseName}</TableCell>
                <TableCell><StatusBadge status={t.status} /></TableCell>
                <TableCell className="text-xs text-zinc-500">{t.createdAt.slice(0, 10)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  ₹{Number(t.totalValue).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: 'draft' | 'in_transit' | 'received' | 'cancelled' }) {
  const m = {
    draft: ['default', 'Draft'],
    in_transit: ['info', 'In transit'],
    received: ['success', 'Received'],
    cancelled: ['danger', 'Cancelled'],
  } as const;
  const [v, t] = m[status];
  return <Badge variant={v}>{t}</Badge>;
}
