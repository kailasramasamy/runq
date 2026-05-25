import { Link } from '@tanstack/react-router';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Plus, MoveRight, Plane, CheckCircle2, IndianRupee, Search } from 'lucide-react';
import {
  PageHeader, Button, Input, Table, TableHeader, TableBody, TableRow, TableCell, Th,
  TableSkeleton, EmptyState, Badge, Combobox,
} from '@/components/ui';
import { useTransferList, useWarehouses } from '@/hooks/queries/use-inventory';
import { KpiStrip, formatInrShort } from '../_widgets';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'in_transit', label: 'In transit' },
  { value: 'received', label: 'Received' },
  { value: 'cancelled', label: 'Cancelled' },
];

type Params = { q?: string; status?: string; warehouse?: string };

export function TransferListPage() {
  const navigate = useNavigate();
  const params = useSearch({ strict: false }) as Params;
  const q = params.q ?? '';
  const statusFilter = params.status ?? '';
  const warehouseFilter = params.warehouse ?? '';

  function updateSearch(patch: Partial<Params>) {
    navigate({
      to: '/inventory/transfers',
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

  const { data, isLoading } = useTransferList({ status: statusFilter || undefined, limit: 100 });
  const { data: warehouses = [] } = useWarehouses();
  const rows = data?.data ?? [];

  const ql = q.toLowerCase();
  const filtered = rows.filter((r) => {
    if (warehouseFilter && r.fromWarehouseId !== warehouseFilter && r.toWarehouseId !== warehouseFilter) return false;
    if (ql) {
      const haystack = `${r.transferNo} ${r.fromWarehouseName} ${r.toWarehouseName}`.toLowerCase();
      if (!haystack.includes(ql)) return false;
    }
    return true;
  });

  const inTransit = rows.filter((r) => r.status === 'in_transit');
  const receivedCount = rows.filter((r) => r.status === 'received').length;
  const inTransitValue = inTransit.reduce((s, r) => s + Number(r.totalValue), 0);

  const warehouseOptions = [
    { value: '', label: 'All warehouses' },
    ...warehouses.map((w) => ({ value: w.id, label: w.name })),
  ];

  const hasFilters = !!(q || statusFilter || warehouseFilter);

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

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-72 max-w-full">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <Input
            placeholder="Search transfer # or warehouse…"
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
          icon={MoveRight}
          title={hasFilters ? 'No results match your filters' : 'No transfers yet'}
          description={hasFilters ? 'Try adjusting your filters.' : 'Use a transfer when stock physically moves between two warehouses.'}
          action={!hasFilters ? (
            <Link to="/inventory/transfers/new">
              <Button variant="primary"><Plus size={16} /> New transfer</Button>
            </Link>
          ) : undefined}
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
            {filtered.map((t) => (
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
