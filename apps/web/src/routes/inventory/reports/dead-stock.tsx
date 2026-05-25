import { useNavigate, useSearch } from '@tanstack/react-router';
import { PackageX, Search } from 'lucide-react';
import {
  PageHeader, Combobox, Input, Table, TableHeader, TableBody, TableRow, TableCell, Th,
  TableSkeleton, EmptyState, Badge,
} from '@/components/ui';
import { useDeadStock, useWarehouses } from '@/hooks/queries/use-inventory';

const DAYS_OPTIONS = [
  { value: '30', label: '30+ days' },
  { value: '60', label: '60+ days' },
  { value: '90', label: '90+ days' },
  { value: '180', label: '180+ days' },
  { value: '365', label: '365+ days' },
];

type Params = { warehouseId?: string; days?: string; q?: string };

export function DeadStockReportPage() {
  const navigate = useNavigate();
  const params = useSearch({ strict: false }) as Params;
  const warehouseId = params.warehouseId ?? '';
  const days = Number(params.days ?? 90);
  const q = params.q ?? '';

  function update(patch: Partial<Params>) {
    navigate({
      to: '/inventory/reports/dead-stock',
      search: (prev) => {
        const next = { ...(prev as Params), ...patch };
        for (const k of Object.keys(next) as (keyof Params)[]) {
          if (!next[k]) delete next[k];
        }
        return next;
      },
      replace: true,
    });
  }

  const { data: warehouses } = useWarehouses();
  const { data, isLoading } = useDeadStock({
    warehouseId: warehouseId || undefined, daysSinceMovement: days,
  });
  const allRows = data ?? [];

  const ql = q.toLowerCase();
  const rows = ql
    ? allRows.filter(
        (r) =>
          r.itemName.toLowerCase().includes(ql) ||
          (r.itemSku ?? '').toLowerCase().includes(ql) ||
          r.warehouseName.toLowerCase().includes(ql),
      )
    : allRows;

  const totalValue = rows.reduce((s, r) => s + r.value, 0);

  const whOptions = [
    { value: '', label: 'All warehouses' },
    ...(warehouses ?? []).map((w) => ({ value: w.id, label: w.name })),
  ];

  return (
    <div>
      <PageHeader
        title="Dead stock"
        description="On-hand stock with no in/out movement for the chosen window."
        fullWidth
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Input
          placeholder="Search item, SKU, warehouse…"
          icon={<Search size={13} />}
          className="w-72 max-w-full"
          value={q}
          onChange={(e) => update({ q: e.target.value || undefined })}
        />
        <div className="min-w-[180px]">
          <label className="mb-1 block text-xs font-medium text-zinc-500">No movement for</label>
          <Combobox
            value={String(days)}
            onChange={(v) => update({ days: v || undefined })}
            options={DAYS_OPTIONS}
          />
        </div>
        <div className="min-w-[220px]">
          <label className="mb-1 block text-xs font-medium text-zinc-500">Warehouse</label>
          <Combobox value={warehouseId} onChange={(v) => update({ warehouseId: v || undefined })} options={whOptions} />
        </div>
        <div className="ml-auto flex items-center gap-4">
          <span className="num text-[12px]" style={{ color: 'var(--text-3)' }}>{rows.length} rows</span>
          <span className="text-sm">
            Frozen value:&nbsp;
            <span className="font-mono font-semibold">
              ₹{totalValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </span>
          </span>
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton rows={6} cols={7} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={PackageX}
          title="No dead stock in this window"
          description="Everything has moved recently — nothing to clear out."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <Th>Item</Th>
              <Th>Warehouse</Th>
              <Th>Batch</Th>
              <Th>Last moved</Th>
              <Th className="text-right">Days idle</Th>
              <Th className="text-right">Qty</Th>
              <Th className="text-right">Value</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={`${r.itemId}-${r.warehouseId}-${r.batchNo}-${i}`}>
                <TableCell>
                  <div className="font-medium">{r.itemName}</div>
                  {r.itemSku && <div className="font-mono text-xs text-zinc-500">{r.itemSku}</div>}
                </TableCell>
                <TableCell>{r.warehouseName}</TableCell>
                <TableCell className="font-mono text-xs">{r.batchNo || '—'}</TableCell>
                <TableCell className="text-xs text-zinc-500">{r.lastMovementDate ?? 'never'}</TableCell>
                <TableCell className="text-right tabular-nums">
                  <Badge variant={r.daysSinceMovement != null && r.daysSinceMovement >= 180 ? 'danger' : 'warning'}>
                    {r.daysSinceMovement != null ? `${r.daysSinceMovement}d` : '∞'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.qty.toLocaleString('en-IN', { maximumFractionDigits: 3 })} {r.itemUnit ?? ''}
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  ₹{r.value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
