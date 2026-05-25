import { Link } from '@tanstack/react-router';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Plus, PackageCheck, Calendar, FileText, IndianRupee, Search } from 'lucide-react';
import {
  PageHeader, Button, Input, Table, TableHeader, TableBody, TableRow, TableCell, Th,
  TableSkeleton, EmptyState, Badge, Combobox,
} from '@/components/ui';
import { useGrnList, useWarehouses } from '@/hooks/queries/use-inventory';
import { KpiStrip, formatInrShort } from '../_widgets';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'posted', label: 'Posted' },
  { value: 'cancelled', label: 'Cancelled' },
];

type Params = { q?: string; status?: string; warehouse?: string };

export function GrnListPage() {
  const navigate = useNavigate();
  const params = useSearch({ strict: false }) as Params;
  const q = params.q ?? '';
  const statusFilter = params.status ?? '';
  const warehouseFilter = params.warehouse ?? '';

  function updateSearch(patch: Partial<Params>) {
    navigate({
      to: '/inventory/grn',
      search: (prev) => {
        const next = { ...(prev as Params), ...patch };
        for (const k of Object.keys(next) as (keyof Params)[]) {
          if (next[k] === '' || next[k] === undefined) delete next[k];
        }
        return next;
      },
      replace: true,
    });
  }

  const { data, isLoading } = useGrnList({ status: statusFilter || undefined, limit: 100 });
  const { data: warehouses = [] } = useWarehouses();
  const rows = data?.data ?? [];

  const ql = q.toLowerCase();
  const filtered = rows.filter((r) => {
    if (warehouseFilter && r.warehouseId !== warehouseFilter) return false;
    if (ql) {
      const haystack = `${r.grnNo} ${r.vendorName ?? ''} ${r.warehouseName}`.toLowerCase();
      if (!haystack.includes(ql)) return false;
    }
    return true;
  });

  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 7);
  const monthRows = rows.filter((r) => r.receivedDate?.startsWith(monthStart));
  const todayCount = rows.filter((r) => r.receivedDate === today && r.status === 'posted').length;
  const draftCount = rows.filter((r) => r.status === 'draft').length;
  const monthValue = monthRows
    .filter((r) => r.status === 'posted')
    .reduce((s, r) => s + Number(r.totalValue), 0);

  const warehouseOptions = [
    { value: '', label: 'All warehouses' },
    ...warehouses.map((w) => ({ value: w.id, label: w.name })),
  ];

  const hasFilters = !!(q || statusFilter || warehouseFilter);

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

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-72 max-w-full">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <Input
            placeholder="Search GRN # or vendor…"
            value={q}
            onChange={(e) => updateSearch({ q: e.target.value || undefined })}
            className="pl-8 h-8 py-0 text-[12.5px]"
          />
        </div>
        <div className="w-44">
          <Combobox
            options={STATUS_OPTIONS}
            value={statusFilter}
            onChange={(v) => updateSearch({ status: v || undefined })}
            placeholder="All statuses"
            inputClassName="h-8 py-0 text-[12.5px]"
          />
        </div>
        <div className="w-52">
          <Combobox
            options={warehouseOptions}
            value={warehouseFilter}
            onChange={(v) => updateSearch({ warehouse: v || undefined })}
            placeholder="All warehouses"
            inputClassName="h-8 py-0 text-[12.5px]"
          />
        </div>
        <div className="flex-1" />
        <span className="num text-[12px]" style={{ color: 'var(--text-3)' }}>{filtered.length} items</span>
      </div>

      {isLoading ? (
        <TableSkeleton rows={6} cols={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={PackageCheck}
          title={hasFilters ? 'No results match your filters' : 'No GRNs yet'}
          description={hasFilters ? 'Try adjusting your filters.' : 'Create a GRN whenever stock arrives at your warehouse.'}
          action={!hasFilters ? (
            <Link to="/inventory/grn/new">
              <Button variant="primary"><Plus size={16} /> New GRN</Button>
            </Link>
          ) : undefined}
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
            {filtered.map((g) => (
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
