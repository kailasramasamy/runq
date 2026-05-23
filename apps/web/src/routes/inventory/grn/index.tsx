import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import {
  PageHeader, Button, Select, Table, TableHeader, TableBody, TableRow, TableCell, Th,
  TableSkeleton, EmptyState, Badge,
} from '@/components/ui';
import { Plus, PackageCheck } from 'lucide-react';
import { useGrnList } from '@/hooks/queries/use-inventory';

export function GrnListPage() {
  const [status, setStatus] = useState<'' | 'draft' | 'posted' | 'cancelled'>('');
  const { data, isLoading } = useGrnList({ status: status || undefined, limit: 100 });
  const rows = data?.data ?? [];

  return (
    <div>
      <PageHeader
        title="Goods Receipt Notes"
        description="Stock received from vendors, openings, and production."
        fullWidth
        actions={
          <Link to="/inventory/grn/new">
            <Button variant="primary"><Plus size={16} /> New GRN</Button>
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
              { value: 'posted', label: 'Posted' },
              { value: 'cancelled', label: 'Cancelled' },
            ]}
          />
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton rows={6} cols={6} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={PackageCheck}
          title="No GRNs yet"
          description="Create a GRN whenever stock arrives at your warehouse."
          action={
            <Link to="/inventory/grn/new">
              <Button variant="primary"><Plus size={16} /> New GRN</Button>
            </Link>
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <Th>GRN #</Th>
              <Th>Date</Th>
              <Th>Vendor</Th>
              <Th>Warehouse</Th>
              <Th>Status</Th>
              <Th className="text-right">Value</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((g) => (
              <TableRow key={g.id}>
                <TableCell className="font-mono">
                  <Link to="/inventory/grn/$id" params={{ id: g.id }} className="text-primary-600 hover:underline">
                    {g.grnNo}
                  </Link>
                </TableCell>
                <TableCell>{g.receivedDate}</TableCell>
                <TableCell>{g.vendorName ?? '—'}</TableCell>
                <TableCell>{g.warehouseName}</TableCell>
                <TableCell><StatusBadge status={g.status} /></TableCell>
                <TableCell className="text-right tabular-nums">
                  ₹{Number(g.totalValue).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: 'draft' | 'posted' | 'cancelled' }) {
  const map = {
    draft: { v: 'default', t: 'Draft' },
    posted: { v: 'success', t: 'Posted' },
    cancelled: { v: 'danger', t: 'Cancelled' },
  } as const;
  const cfg = map[status];
  return <Badge variant={cfg.v}>{cfg.t}</Badge>;
}
