import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { Plus, ClipboardCheck, PlayCircle, CheckCircle2, Snowflake, Search } from 'lucide-react';
import {
  PageHeader, Button, Input, Table, TableHeader, TableBody, TableRow, TableCell, Th,
  TableSkeleton, EmptyState, Badge, Combobox,
} from '@/components/ui';
import { useStockTakeList, useWarehouses } from '@/hooks/queries/use-inventory';
import { KpiStrip } from '../_widgets';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'posted', label: 'Posted' },
  { value: 'cancelled', label: 'Cancelled' },
];

type StockTakeStatus = 'in_progress' | 'reviewed' | 'posted' | 'cancelled';
type Params = { q?: string; status?: StockTakeStatus; warehouse?: string };

export function StockTakeListPage() {
  const navigate = useNavigate();
  const params = useSearch({ strict: false }) as Params;
  const search = params.q ?? '';
  const statusFilter = params.status ?? '';
  const warehouseFilter = params.warehouse ?? '';

  function updateSearch(patch: Partial<Params>) {
    navigate({
      to: '/inventory/stock-take',
      search: (prev: Params) => {
        const next = { ...prev, ...patch };
        for (const k of Object.keys(next) as (keyof Params)[]) {
          if (next[k] === '' || next[k] === undefined) delete next[k];
        }
        return next;
      },
      replace: true,
    } as never);
  }

  const { data: warehouses } = useWarehouses();
  const { data, isLoading } = useStockTakeList({ status: statusFilter || undefined, limit: 100 });
  const allRows = data?.data ?? [];

  const whOptions = [
    { value: '', label: 'All warehouses' },
    ...(warehouses ?? []).map((w) => ({ value: w.name, label: w.name })),
  ];

  const rows = allRows.filter((r) => {
    const q = search.toLowerCase();
    const matchesQ = !q || r.stNo.toLowerCase().includes(q) || r.warehouseName.toLowerCase().includes(q);
    const matchesWh = !warehouseFilter || r.warehouseName === warehouseFilter;
    return matchesQ && matchesWh;
  });

  const inProgress = rows.filter((r) => r.status === 'in_progress');
  const frozen = inProgress.filter((r) => r.frozen).length;
  const postedThisMonth = rows.filter((r) =>
    r.status === 'posted' && r.completedAt?.startsWith(new Date().toISOString().slice(0, 7))
  ).length;
  const hasFilters = !!search || !!statusFilter || !!warehouseFilter;

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

      <KpiStrip tiles={[
        { label: 'In view', value: rows.length, icon: ClipboardCheck, loading: isLoading },
        { label: 'In progress', value: inProgress.length, icon: PlayCircle, tone: inProgress.length > 0 ? 'warning' : 'muted', loading: isLoading },
        { label: 'Frozen', value: frozen, icon: Snowflake, tone: frozen > 0 ? 'warning' : 'muted', loading: isLoading },
        { label: 'Posted this month', value: postedThisMonth, icon: CheckCircle2, tone: 'success', loading: isLoading },
      ]} />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="w-72 max-w-full">
          <Input
            icon={<Search size={13} />}
            placeholder="Search stock-take # or warehouse…"
            value={search}
            onChange={(e) => updateSearch({ q: e.target.value || undefined })}
          />
        </div>
        <Combobox
          options={STATUS_OPTIONS}
          value={statusFilter}
          onChange={(v) => updateSearch({ status: (v || undefined) as StockTakeStatus | undefined })}
          placeholder="All statuses"
          inputClassName="h-8 py-0 text-[12.5px]"
        />
        <Combobox
          options={whOptions}
          value={warehouseFilter}
          onChange={(v) => updateSearch({ warehouse: v || undefined })}
          placeholder="All warehouses"
          inputClassName="h-8 py-0 text-[12.5px]"
        />
        <div className="flex-1" />
        <span className="num text-[12px]" style={{ color: 'var(--text-3)' }}>{rows.length} sessions</span>
      </div>

      {isLoading ? (
        <TableSkeleton rows={5} cols={5} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title={hasFilters ? 'No sessions match your filters' : 'No stock take sessions yet'}
          description={hasFilters ? 'Try adjusting your search or filters.' : 'Start a session to compare physical count against the system.'}
          action={!hasFilters && <Link to="/inventory/stock-take/new"><Button variant="primary"><Plus size={16} /> Start session</Button></Link>}
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

function StatusBadge({ status }: { status: StockTakeStatus }) {
  const m: Record<StockTakeStatus, ['info' | 'warning' | 'success' | 'danger', string]> = {
    in_progress: ['info', 'In progress'],
    reviewed: ['warning', 'Reviewed'],
    posted: ['success', 'Posted'],
    cancelled: ['danger', 'Cancelled'],
  };
  const [v, t] = m[status];
  return <Badge variant={v}>{t}</Badge>;
}
