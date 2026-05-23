import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import {
  PageHeader, Button, Select, Table, TableHeader, TableBody, TableRow, TableCell, Th,
  TableSkeleton, EmptyState, Badge,
} from '@/components/ui';
import { Plus, PackageCheck, Calendar, FileText, IndianRupee } from 'lucide-react';
import { useGrnList } from '@/hooks/queries/use-inventory';
import { KpiStrip, formatInrShort } from '../_widgets';

export function GrnListPage() {
  const [status, setStatus] = useState<'' | 'draft' | 'posted' | 'cancelled'>('');
  const { data, isLoading } = useGrnList({ status: status || undefined, limit: 100 });
  const rows = data?.data ?? [];

  // KPI inputs computed from the (filtered) page — these reflect what the
  // user is looking at, not the whole tenant. Good enough for "see the
  // shape of the list at a glance" without an extra round-trip.
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 7);
  const monthRows = rows.filter((r) => r.receivedDate?.startsWith(monthStart));
  const todayCount = rows.filter((r) => r.receivedDate === today && r.status === 'posted').length;
  const draftCount = rows.filter((r) => r.status === 'draft').length;
  const monthValue = monthRows
    .filter((r) => r.status === 'posted')
    .reduce((s, r) => s + Number(r.totalValue), 0);

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

      <KpiStrip tiles={[
        { label: 'In view', value: rows.length, icon: PackageCheck, loading: isLoading },
        { label: 'Posted today', value: todayCount, icon: Calendar, tone: 'success', loading: isLoading },
        { label: 'Drafts', value: draftCount, icon: FileText, tone: draftCount > 0 ? 'warning' : 'muted', loading: isLoading },
        { label: 'MTD posted value', value: formatInrShort(monthValue), icon: IndianRupee, loading: isLoading },
      ]} />

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
                  <Link to="/inventory/grn/$id" params={{ id: g.id }} className="hover:underline" style={{ color: 'var(--accent-text)' }}>
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
