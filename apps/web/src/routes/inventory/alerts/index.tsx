/**
 * Stock Alerts — low stock and out of stock in one place.
 *
 * Supersedes the reorder-only report: an item with no reorder level set is
 * invisible there, but a stockout is still a stockout. Filtering is done
 * server-side so the counts in the tabs stay honest on large catalogues.
 */
import { useNavigate, useSearch } from '@tanstack/react-router';
import { AlertTriangle, PackageX, Search, TrendingDown } from 'lucide-react';
import {
  PageHeader, Combobox, Input, Table, TableHeader, TableBody, TableRow, TableCell, Th,
  TableSkeleton, EmptyState, Badge,
} from '@/components/ui';
import {
  useStockAlerts, useStockAlertCounts, useWarehouses,
  type StockAlert,
} from '@/hooks/queries/use-inventory';

type Params = { status?: 'all' | 'low' | 'out'; warehouseId?: string; q?: string };

const qty = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 3 });

export function StockAlertsPage() {
  const navigate = useNavigate();
  const params = useSearch({ strict: false }) as Params;
  const status = params.status ?? 'all';
  const warehouseId = params.warehouseId ?? '';
  const q = params.q ?? '';

  function update(patch: Partial<Params>) {
    navigate({
      to: '/inventory/alerts',
      search: (prev) => {
        const next = { ...(prev as Params), ...patch };
        for (const k of Object.keys(next) as (keyof Params)[]) {
          if (!next[k] || next[k] === 'all') delete next[k];
        }
        return next;
      },
      replace: true,
    });
  }

  const { data: warehouses } = useWarehouses();
  const { data: counts } = useStockAlertCounts();
  const { data, isLoading } = useStockAlerts({ status, warehouseId: warehouseId || undefined, search: q || undefined });
  const rows = data ?? [];

  const whOptions = [
    { value: '', label: 'All warehouses' },
    ...(warehouses ?? []).map((w) => ({ value: w.id, label: w.name })),
  ];

  return (
    <div>
      <PageHeader
        title="Stock alerts"
        description="Items that are out of stock or at/below their reorder level."
        fullWidth
      />

      {/* Counts double as the status filter — the number and the way to act
          on it should not be two separate controls. */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <CountCard
          icon={PackageX}
          label="Out of stock"
          value={counts?.out ?? 0}
          tone="danger"
          active={status === 'out'}
          onClick={() => update({ status: status === 'out' ? 'all' : 'out' })}
        />
        <CountCard
          icon={TrendingDown}
          label="Running low"
          value={counts?.low ?? 0}
          tone="warning"
          active={status === 'low'}
          onClick={() => update({ status: status === 'low' ? 'all' : 'low' })}
        />
        <CountCard
          icon={AlertTriangle}
          label="All alerts"
          value={counts?.total ?? 0}
          tone="neutral"
          active={status === 'all'}
          onClick={() => update({ status: 'all' })}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Input
          placeholder="Search item or SKU…"
          icon={<Search size={13} />}
          className="w-72 max-w-full"
          value={q}
          onChange={(e) => update({ q: e.target.value || undefined })}
        />
        <div className="min-w-[220px]">
          <label className="mb-1 block text-xs font-medium text-zinc-500">Warehouse</label>
          <Combobox
            value={warehouseId}
            onChange={(v) => update({ warehouseId: v || undefined })}
            options={whOptions}
          />
        </div>
        <span className="num ml-auto text-[12px]" style={{ color: 'var(--text-3)' }}>
          {rows.length} rows
        </span>
      </div>

      {isLoading ? (
        <TableSkeleton rows={6} cols={7} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={AlertTriangle}
          title={emptyTitle(status)}
          description="Nothing needs attention right now."
        />
      ) : (
        <AlertsTable rows={rows} />
      )}
    </div>
  );
}

function emptyTitle(status: Params['status']) {
  if (status === 'out') return 'Nothing is out of stock';
  if (status === 'low') return 'Nothing is running low';
  return 'Stock levels look healthy';
}

function AlertsTable({ rows }: { rows: StockAlert[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <Th>Item</Th>
          <Th>Warehouse</Th>
          <Th>Status</Th>
          <Th className="text-right">On hand</Th>
          <Th className="text-right">Reorder at</Th>
          <Th className="text-right">Short by</Th>
          <Th className="text-right">Reorder qty</Th>
          <Th>Supplier</Th>
          <Th className="text-right">Last moved</Th>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={`${r.itemId}-${r.warehouseId}`}>
            <TableCell>
              <div className="font-medium">{r.itemName}</div>
              {r.itemSku && <div className="font-mono text-xs text-zinc-500">{r.itemSku}</div>}
            </TableCell>
            <TableCell>{r.warehouseName}</TableCell>
            <TableCell><StatusBadge alert={r} /></TableCell>
            <TableCell className="text-right tabular-nums">
              {qty(r.onHand)} {r.itemUnit ?? ''}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {r.reorderLevel === null
                ? <span className="text-zinc-400">not set</span>
                : qty(r.reorderLevel)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {r.reorderLevel !== null && r.shortBy > 0
                ? <Badge variant="warning">{qty(r.shortBy)}</Badge>
                : '—'}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {r.reorderQty === null ? '—' : qty(r.reorderQty)}
            </TableCell>
            <TableCell className="text-zinc-500">{r.supplierName ?? '—'}</TableCell>
            <TableCell className="text-right tabular-nums text-zinc-500">
              {r.daysSinceLastMovement === null
                ? '—'
                : r.daysSinceLastMovement === 0
                  ? 'Today'
                  : `${r.daysSinceLastMovement}d ago`}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function StatusBadge({ alert }: { alert: StockAlert }) {
  if (alert.status === 'out') return <Badge variant="danger">Out of stock</Badge>;
  if (alert.urgency === 'critical') return <Badge variant="danger">Critical</Badge>;
  return <Badge variant="warning">Low</Badge>;
}

function CountCard({
  icon: Icon, label, value, tone, active, onClick,
}: {
  icon: typeof AlertTriangle;
  label: string;
  value: number;
  tone: 'danger' | 'warning' | 'neutral';
  active: boolean;
  onClick: () => void;
}) {
  const toneClass = {
    danger: 'text-rose-600 dark:text-rose-400',
    warning: 'text-amber-600 dark:text-amber-400',
    neutral: 'text-zinc-600 dark:text-zinc-300',
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex items-center gap-3 rounded-lg border p-3 text-left transition',
        active
          ? 'border-zinc-400 bg-zinc-50 dark:border-zinc-500 dark:bg-zinc-800/60'
          : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-600',
      ].join(' ')}
    >
      <Icon size={18} className={toneClass} />
      <div>
        <div className={`num text-xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
        <div className="text-xs text-zinc-500">{label}</div>
      </div>
    </button>
  );
}
