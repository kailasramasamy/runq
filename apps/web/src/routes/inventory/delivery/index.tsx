import { Link } from '@tanstack/react-router';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Plus, Truck, Calendar, FileText, IndianRupee, Search } from 'lucide-react';
import {
  PageHeader, Button, Input, Table, TableHeader, TableBody, TableRow, TableCell, Th,
  TableSkeleton, EmptyState, Badge, Combobox,
} from '@/components/ui';
import { useDnList, useWarehouses } from '@/hooks/queries/use-inventory';
import { KpiStrip, formatInrShort } from '../_widgets';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'dispatched', label: 'Dispatched' },
  { value: 'cancelled', label: 'Cancelled' },
];

type Params = { q?: string; status?: string; warehouse?: string };

export function DeliveryListPage() {
  const navigate = useNavigate();
  const params = useSearch({ strict: false }) as Params;
  const q = params.q ?? '';
  const statusFilter = params.status ?? '';
  const warehouseFilter = params.warehouse ?? '';

  function updateSearch(patch: Partial<Params>) {
    navigate({
      to: '/inventory/delivery',
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

  const { data, isLoading } = useDnList({ status: statusFilter || undefined, limit: 100 });
  const { data: warehouses = [] } = useWarehouses();
  const rows = data?.data ?? [];

  const ql = q.toLowerCase();
  const filtered = rows.filter((r) => {
    if (warehouseFilter && r.warehouseId !== warehouseFilter) return false;
    if (ql) {
      const haystack = `${r.dnNo} ${r.customerName ?? ''} ${r.warehouseName}`.toLowerCase();
      if (!haystack.includes(ql)) return false;
    }
    return true;
  });

  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 7);
  const monthRows = rows.filter((r) => r.dispatchDate?.startsWith(monthStart));
  const todayCount = rows.filter((r) => r.dispatchDate === today && r.status === 'dispatched').length;
  const draftCount = rows.filter((r) => r.status === 'draft').length;
  const monthCogs = monthRows
    .filter((r) => r.status === 'dispatched')
    .reduce((s, r) => s + Number(r.totalValue), 0);

  const warehouseOptions = [
    { value: '', label: 'All warehouses' },
    ...warehouses.map((w) => ({ value: w.id, label: w.name })),
  ];

  const hasFilters = !!(q || statusFilter || warehouseFilter);

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

      <KpiStrip tiles={[
        { label: 'In view', value: rows.length, icon: Truck, loading: isLoading },
        { label: 'Dispatched today', value: todayCount, icon: Calendar, tone: 'success', loading: isLoading },
        { label: 'Drafts', value: draftCount, icon: FileText, tone: draftCount > 0 ? 'warning' : 'muted', loading: isLoading },
        { label: 'MTD COGS', value: formatInrShort(monthCogs), icon: IndianRupee, loading: isLoading },
      ]} />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-72 max-w-full">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <Input
            placeholder="Search DN # or customer…"
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
          icon={Truck}
          title={hasFilters ? 'No results match your filters' : 'No delivery notes yet'}
          description={hasFilters ? 'Try adjusting your filters.' : 'Create a delivery note when stock leaves your warehouse.'}
          action={!hasFilters ? (
            <Link to="/inventory/delivery/new">
              <Button variant="primary"><Plus size={16} /> New delivery</Button>
            </Link>
          ) : undefined}
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
            {filtered.map((d) => (
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
