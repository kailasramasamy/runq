import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { Plus, Recycle, Search, TrendingDown, PackageOpen } from 'lucide-react';
import {
  PageHeader, Button, Input, Table, TableHeader, TableBody, TableRow, TableCell, Th,
  TableSkeleton, EmptyState, Badge, Combobox,
} from '@/components/ui';
import { useReclaimList } from '@/hooks/queries/use-reclaims';
import { useWarehouses } from '@/hooks/queries/use-inventory';
import { KpiStrip, formatInrShort } from '../../inventory/_widgets';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'posted', label: 'Posted' },
  { value: 'cancelled', label: 'Cancelled' },
];

type Params = { q?: string; status?: string; warehouse?: string };

export function ReclaimListPage() {
  const navigate = useNavigate();
  const params = useSearch({ strict: false }) as Params;
  const q = params.q ?? '';
  const statusFilter = params.status ?? '';
  const warehouseFilter = params.warehouse ?? '';

  function updateSearch(patch: Partial<Params>) {
    navigate({
      to: '/manufacturing/reclaims',
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

  const { data, isLoading } = useReclaimList({ status: statusFilter || undefined, limit: 100 });
  const { data: warehouses = [] } = useWarehouses();
  const rows = data?.data ?? [];

  const ql = q.toLowerCase();
  const filtered = rows.filter((r) => {
    if (warehouseFilter && r.warehouseId !== warehouseFilter) return false;
    if (ql && !`${r.reclaimNo} ${r.warehouseName}`.toLowerCase().includes(ql)) return false;
    return true;
  });

  const monthStart = new Date().toISOString().slice(0, 7);
  const monthPosted = rows.filter((r) => r.status === 'posted' && r.reclaimDate?.startsWith(monthStart));
  const monthRecovered = monthPosted.reduce((s, r) => s + Number(r.recoveredValue), 0);
  const monthLoss = monthPosted.reduce((s, r) => s + Number(r.lossValue), 0);

  const warehouseOptions = [
    { value: '', label: 'All warehouses' },
    ...warehouses.map((w) => ({ value: w.id, label: w.name })),
  ];

  const hasFilters = !!(q || statusFilter || warehouseFilter);

  return (
    <div>
      <PageHeader
        title="Reclaims"
        description="Open unsold finished goods and put the material back into the raw-material pool."
        fullWidth
        actions={
          <Link to="/manufacturing/reclaims/new">
            <Button variant="primary"><Plus size={16} /> New reclaim</Button>
          </Link>
        }
      />

      <KpiStrip tiles={[
        { label: 'MTD recovered', value: formatInrShort(monthRecovered), icon: Recycle, tone: 'success', loading: isLoading },
        { label: 'MTD teardown loss', value: formatInrShort(monthLoss), icon: TrendingDown, tone: monthLoss > 0 ? 'danger' : 'muted', loading: isLoading },
        { label: 'Reclaims this month', value: monthPosted.length, icon: PackageOpen, tone: 'muted', loading: isLoading },
      ]} />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-72 max-w-full">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <Input
            placeholder="Search reclaim # or warehouse…"
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
          icon={Recycle}
          title={hasFilters ? 'No results match your filters' : 'No reclaims yet'}
          description={
            hasFilters
              ? 'Try adjusting your filters.'
              : 'Record a reclaim when unsold stock is opened up and the material goes back into production.'
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <Th>Reclaim #</Th>
              <Th>Date</Th>
              <Th>Warehouse</Th>
              <Th>Status</Th>
              <Th className="text-right">Recovered</Th>
              <Th className="text-right">Loss</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono">
                  <Link to="/manufacturing/reclaims/$id" params={{ id: r.id }} className="hover:underline" style={{ color: 'var(--accent-text)' }}>
                    {r.reclaimNo}
                  </Link>
                </TableCell>
                <TableCell>{r.reclaimDate}</TableCell>
                <TableCell>{r.warehouseName}</TableCell>
                <TableCell><StatusBadge status={r.status} /></TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(Number(r.recoveredValue))}
                </TableCell>
                <TableCell className="text-right tabular-nums" style={{ color: Number(r.lossValue) > 0 ? '#b91c1c' : undefined }}>
                  {formatMoney(Number(r.lossValue))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function formatMoney(n: number) {
  return n === 0 ? '—' : `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function StatusBadge({ status }: { status: 'draft' | 'posted' | 'cancelled' }) {
  const m = {
    draft: ['default', 'Draft'],
    posted: ['success', 'Posted'],
    cancelled: ['danger', 'Cancelled'],
  } as const;
  const [v, t] = m[status];
  return <Badge variant={v}>{t}</Badge>;
}
