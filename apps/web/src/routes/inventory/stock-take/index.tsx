import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Plus, ClipboardCheck } from 'lucide-react';
import {
  PageHeader, Button, Select, Table, TableHeader, TableBody, TableRow, TableCell, Th,
  TableSkeleton, EmptyState, Badge,
} from '@/components/ui';
import { useStockTakeList } from '@/hooks/queries/use-inventory';

export function StockTakeListPage() {
  const [status, setStatus] = useState<'' | 'in_progress' | 'reviewed' | 'posted' | 'cancelled'>('');
  const { data, isLoading } = useStockTakeList({ status: status || undefined, limit: 100 });
  const rows = data?.data ?? [];

  return (
    <div>
      <PageHeader
        title="Stock take"
        description="Physical count sessions — snapshot, count, post variance."
        fullWidth
        actions={
          <Link to="/inventory/stock-take/new">
            <Button variant="primary"><Plus size={16} /> New session</Button>
          </Link>
        }
      />

      <div className="mb-4 min-w-[180px]">
        <label className="mb-1 block text-xs font-medium text-zinc-500">Status</label>
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          options={[
            { value: '', label: 'All' },
            { value: 'in_progress', label: 'In progress' },
            { value: 'reviewed', label: 'Reviewed' },
            { value: 'posted', label: 'Posted' },
            { value: 'cancelled', label: 'Cancelled' },
          ]}
        />
      </div>

      {isLoading ? (
        <TableSkeleton rows={5} cols={5} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No stock take sessions yet"
          description="Start a session to compare physical count against the system."
          action={<Link to="/inventory/stock-take/new"><Button variant="primary"><Plus size={16} /> Start session</Button></Link>}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <Th>ST #</Th>
              <Th>Warehouse</Th>
              <Th>Scope</Th>
              <Th>Status</Th>
              <Th>Started</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-mono">
                  <Link to="/inventory/stock-take/$id" params={{ id: s.id }} className="hover:underline" style={{ color: 'var(--accent-text)' }}>
                    {s.stNo}
                  </Link>
                </TableCell>
                <TableCell>{s.warehouseName}</TableCell>
                <TableCell className="capitalize">{s.scope}</TableCell>
                <TableCell><StatusBadge status={s.status} /></TableCell>
                <TableCell className="text-xs text-zinc-500">{s.startedAt.slice(0, 16).replace('T', ' ')}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: 'in_progress' | 'reviewed' | 'posted' | 'cancelled' }) {
  const m = {
    in_progress: ['info', 'In progress'],
    reviewed: ['warning', 'Reviewed'],
    posted: ['success', 'Posted'],
    cancelled: ['danger', 'Cancelled'],
  } as const;
  const [v, t] = m[status];
  return <Badge variant={v}>{t}</Badge>;
}
