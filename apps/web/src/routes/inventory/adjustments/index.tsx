import { Link } from '@tanstack/react-router';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Plus, SlidersHorizontal, TrendingUp, TrendingDown, Clock, Search } from 'lucide-react';
import {
  PageHeader, Button, Input, Table, TableHeader, TableBody, TableRow, TableCell, Th,
  TableSkeleton, EmptyState, Badge, Combobox,
} from '@/components/ui';
import { useAdjustmentList, useWarehouses } from '@/hooks/queries/use-inventory';
import { KpiStrip, formatInrShort } from '../_widgets';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'pending_approval', label: 'Pending approval' },
  { value: 'posted', label: 'Posted' },
  { value: 'cancelled', label: 'Cancelled' },
];

const REASON_LABELS: Record<string, string> = {
  damage: 'Damage', expiry: 'Expiry', theft: 'Theft', found: 'Found',
  revaluation: 'Revaluation', correction: 'Correction', opening_balance: 'Opening',
};

type Params = { q?: string; status?: string; warehouse?: string };

export function AdjustmentListPage() {
  const navigate = useNavigate();
  const params = useSearch({ strict: false }) as Params;
  const q = params.q ?? '';
  const statusFilter = params.status ?? '';
  const warehouseFilter = params.warehouse ?? '';

  function updateSearch(patch: Partial<Params>) {
    navigate({
      to: '/inventory/adjustments',
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

  const { data, isLoading } = useAdjustmentList({ status: statusFilter || undefined, limit: 100 });
  const { data: warehouses = [] } = useWarehouses();
  const rows = data?.data ?? [];

  const ql = q.toLowerCase();
  const filtered = rows.filter((r) => {
    if (warehouseFilter && r.warehouseId !== warehouseFilter) return false;
    if (ql) {
      const haystack = `${r.adjNo} ${r.warehouseName}`.toLowerCase();
      if (!haystack.includes(ql)) return false;
    }
    return true;
  });

  const monthStart = new Date().toISOString().slice(0, 7);
  const monthPosted = rows.filter((r) => r.status === 'posted' && r.adjustmentDate?.startsWith(monthStart));
  const monthNet = monthPosted.reduce((s, r) => s + Number(r.totalValueDelta), 0);
  const monthWriteOff = monthPosted.filter((r) => Number(r.totalValueDelta) < 0)
    .reduce((s, r) => s + Number(r.totalValueDelta), 0);
  const monthGain = monthPosted.filter((r) => Number(r.totalValueDelta) > 0)
    .reduce((s, r) => s + Number(r.totalValueDelta), 0);
  const pendingApproval = rows.filter((r) => r.status === 'pending_approval').length;

  const warehouseOptions = [
    { value: '', label: 'All warehouses' },
    ...warehouses.map((w) => ({ value: w.id, label: w.name })),
  ];

  const hasFilters = !!(q || statusFilter || warehouseFilter);

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

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-72 max-w-full">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <Input
            placeholder="Search adjustment # or warehouse…"
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
          icon={SlidersHorizontal}
          title={hasFilters ? 'No results match your filters' : 'No adjustments yet'}
          description={hasFilters ? 'Try adjusting your filters.' : 'Record a stock adjustment when on-hand qty needs to be corrected.'}
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
            {filtered.map((a) => {
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
