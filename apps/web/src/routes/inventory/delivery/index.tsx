import { Link } from '@tanstack/react-router';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Plus, Truck, Calendar, Clock, FileText, IndianRupee, Search } from 'lucide-react';
import {
  PageHeader, Button, Input, Table, TableHeader, TableBody, TableRow, TableCell, Th,
  TableSkeleton, EmptyState, Badge, Combobox,
} from '@/components/ui';
import { useDnList, useWarehouses, type DeliveryNote } from '@/hooks/queries/use-inventory';
import { usePendingDispatches } from '@/hooks/queries/use-sales-dispatch';
import { PendingDispatchTab } from './_pending-tab';
import { KpiStrip, formatInrShort } from '../_widgets';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'dispatched', label: 'Dispatched' },
  { value: 'cancelled', label: 'Cancelled' },
];

type Params = { q?: string; status?: string; warehouse?: string; tab?: string };

/**
 * How far back the "Awaiting dispatch" queue looks by default. Tenants that
 * invoiced for years before turning dispatch tracking on would otherwise open
 * the tab to their entire back catalogue. Widen with the date filter.
 */
const QUEUE_LOOKBACK_DAYS = 60;

function queueFloor() {
  const d = new Date();
  d.setDate(d.getDate() - QUEUE_LOOKBACK_DAYS);
  return d.toISOString().slice(0, 10);
}

export function DeliveryListPage() {
  const navigate = useNavigate();
  const params = useSearch({ strict: false }) as Params;
  const q = params.q ?? '';
  const statusFilter = params.status ?? '';
  const warehouseFilter = params.warehouse ?? '';
  const tab = params.tab === 'pending' ? 'pending' : 'dispatches';

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
  const pendingFrom = queueFloor();
  const { data: pending } = usePendingDispatches({ from: pendingFrom, limit: 1 });
  const pendingCount = pending?.total ?? 0;

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
        title="Sales dispatch"
        description="Goods leaving for customers — from an invoice or keyed in. Books COGS on dispatch."
        fullWidth
        actions={
          <Link to="/inventory/delivery/new">
            <Button variant="primary"><Plus size={16} /> New delivery</Button>
          </Link>
        }
      />

      <KpiStrip tiles={[
        { label: 'Awaiting dispatch', value: pendingCount, icon: Clock, tone: pendingCount > 0 ? 'warning' : 'muted' },
        { label: 'Dispatched today', value: todayCount, icon: Calendar, tone: 'success', loading: isLoading },
        { label: 'Drafts', value: draftCount, icon: FileText, tone: draftCount > 0 ? 'warning' : 'muted', loading: isLoading },
        { label: 'MTD COGS', value: formatInrShort(monthCogs), icon: IndianRupee, loading: isLoading },
      ]} />

      <div className="mb-3 flex gap-1 border-b" style={{ borderColor: 'var(--border-1)' }}>
        <TabButton
          active={tab === 'pending'}
          onClick={() => updateSearch({ tab: 'pending' })}
          label="Awaiting dispatch"
          count={pendingCount}
        />
        <TabButton
          active={tab === 'dispatches'}
          onClick={() => updateSearch({ tab: undefined })}
          label="Dispatches"
        />
      </div>

      {tab === 'pending' ? (
        <PendingDispatchTab from={pendingFrom} q={q || undefined} />
      ) : (
        <DispatchesTab
          rows={filtered}
          isLoading={isLoading}
          hasFilters={hasFilters}
          q={q}
          statusFilter={statusFilter}
          warehouseFilter={warehouseFilter}
          warehouseOptions={warehouseOptions}
          onSearch={updateSearch}
        />
      )}
    </div>
  );
}

interface DispatchesTabProps {
  rows: DeliveryNote[];
  isLoading: boolean;
  hasFilters: boolean;
  q: string;
  statusFilter: string;
  warehouseFilter: string;
  warehouseOptions: Array<{ value: string; label: string }>;
  onSearch: (patch: Partial<Params>) => void;
}

function DispatchesTab({
  rows, isLoading, hasFilters, q, statusFilter, warehouseFilter, warehouseOptions, onSearch,
}: DispatchesTabProps) {
  const updateSearch = onSearch;
  const filtered = rows;
  return (
    <>
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
              <Th>Source</Th>
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
                <TableCell><SourceCell dn={d} /></TableCell>
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
    </>
  );
}

/**
 * Where the document came from. A hand-keyed dispatch is legitimate but worth
 * flagging — same idea as marking an unplanned production run.
 */
function SourceCell({ dn }: { dn: DeliveryNote }) {
  if (dn.direction === 'in') return <Badge variant="warning">Return</Badge>;
  if (dn.invoiceNumber) {
    return <span className="font-mono text-[12px]">{dn.invoiceNumber}</span>;
  }
  return <Badge variant="default">Unlinked</Badge>;
}

function TabButton({ active, onClick, label, count }: {
  active: boolean; onClick: () => void; label: string; count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-mb-px border-b-2 px-3 py-1.5 text-[12.5px] font-medium"
      style={{
        borderColor: active ? 'var(--accent-text)' : 'transparent',
        color: active ? 'var(--accent-text)' : 'var(--text-3)',
      }}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span className="ml-1.5 rounded-full px-1.5 py-0.5 text-[10.5px] tabular-nums"
          style={{ background: 'var(--surface-3)', color: 'var(--text-2)' }}>
          {count}
        </span>
      )}
    </button>
  );
}

function StatusBadge({ status }: { status: 'draft' | 'dispatched' | 'cancelled' }) {
  const m = { draft: ['default', 'Draft'], dispatched: ['success', 'Dispatched'], cancelled: ['danger', 'Cancelled'] } as const;
  const [v, t] = m[status];
  return <Badge variant={v}>{t}</Badge>;
}
