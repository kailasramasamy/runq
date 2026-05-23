import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Plus, Truck } from 'lucide-react';
import {
  PageHeader, Button, Select, Table, TableHeader, TableBody, TableRow, TableCell, Th,
  TableSkeleton, EmptyState, Badge,
} from '@/components/ui';
import { useDnList } from '@/hooks/queries/use-inventory';

export function DeliveryListPage() {
  const [status, setStatus] = useState<'' | 'draft' | 'dispatched' | 'cancelled'>('');
  const { data, isLoading } = useDnList({ status: status || undefined, limit: 100 });
  const rows = data?.data ?? [];

  return (
    <div>
      <PageHeader
        title="Delivery notes"
        description="Stock dispatched to customers — books COGS on dispatch."
        fullWidth
        actions={
          <Link to="/inventory/delivery/new">
            <Button variant="primary"><Plus size={16} /> New delivery</Button>
          </Link>
        }
      />

      <div className="mb-4 flex items-end gap-3">
        <div className="min-w-[180px]">
          <label className="mb-1 block text-xs font-medium text-zinc-500">Status</label>
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            options={[
              { value: '', label: 'All' },
              { value: 'draft', label: 'Draft' },
              { value: 'dispatched', label: 'Dispatched' },
              { value: 'cancelled', label: 'Cancelled' },
            ]}
          />
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton rows={6} cols={6} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="No delivery notes yet"
          description="Create a delivery note when stock leaves your warehouse."
          action={
            <Link to="/inventory/delivery/new">
              <Button variant="primary"><Plus size={16} /> New delivery</Button>
            </Link>
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <Th>DN #</Th>
              <Th>Date</Th>
              <Th>Customer</Th>
              <Th>Warehouse</Th>
              <Th>Status</Th>
              <Th className="text-right">COGS</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-mono">
                  <Link to="/inventory/delivery/$id" params={{ id: d.id }} className="hover:underline" style={{ color: 'var(--accent-text)' }}>
                    {d.dnNo}
                  </Link>
                </TableCell>
                <TableCell>{d.dispatchDate}</TableCell>
                <TableCell>{d.customerName ?? '—'}</TableCell>
                <TableCell>{d.warehouseName}</TableCell>
                <TableCell><StatusBadge status={d.status} /></TableCell>
                <TableCell className="text-right tabular-nums">
                  ₹{Number(d.totalValue).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: 'draft' | 'dispatched' | 'cancelled' }) {
  const m = { draft: ['default', 'Draft'], dispatched: ['success', 'Dispatched'], cancelled: ['danger', 'Cancelled'] } as const;
  const [v, t] = m[status];
  return <Badge variant={v}>{t}</Badge>;
}
