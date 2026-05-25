import { useNavigate, useSearch } from '@tanstack/react-router';
import { Wallet, Search } from 'lucide-react';
import {
  PageHeader, Combobox, Input, Table, TableHeader, TableBody, TableRow, TableCell, Th,
  TableSkeleton, EmptyState,
} from '@/components/ui';
import { useValuation, useWarehouses } from '@/hooks/queries/use-inventory';

type Params = { warehouseId?: string; asOf?: string; q?: string };

export function ValuationReportPage() {
  const today = new Date().toISOString().slice(0, 10);
  const navigate = useNavigate();
  const params = useSearch({ strict: false }) as Params;
  const warehouseId = params.warehouseId ?? '';
  const asOf = params.asOf ?? today;
  const q = params.q ?? '';

  function update(patch: Partial<Params>) {
    navigate({
      to: '/inventory/reports/valuation',
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
  const { data, isLoading } = useValuation({ warehouseId: warehouseId || undefined, asOf });
  const allRows = data?.rows ?? [];

  const ql = q.toLowerCase();
  const rows = ql
    ? allRows.filter(
        (r) =>
          r.itemName.toLowerCase().includes(ql) ||
          (r.itemSku ?? '').toLowerCase().includes(ql) ||
          r.warehouseName.toLowerCase().includes(ql),
      )
    : allRows;

  const whOptions = [
    { value: '', label: 'All warehouses' },
    ...(warehouses ?? []).map((w) => ({ value: w.id, label: w.name })),
  ];

  return (
    <div>
      <PageHeader
        title="Stock valuation"
        description="Point-in-time inventory value using moving weighted-average cost."
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
        <div className="min-w-[200px]">
          <label className="mb-1 block text-xs font-medium text-zinc-500">As of</label>
          <Input type="date" value={asOf} max={today} onChange={(e) => update({ asOf: e.target.value || undefined })} />
        </div>
        <div className="min-w-[220px]">
          <label className="mb-1 block text-xs font-medium text-zinc-500">Warehouse</label>
          <Combobox value={warehouseId} onChange={(v) => update({ warehouseId: v || undefined })} options={whOptions} />
        </div>
        <div className="ml-auto flex items-center gap-4">
          <span className="num text-[12px]" style={{ color: 'var(--text-3)' }}>{rows.length} rows</span>
          <span className="text-sm">
            Total value as of {data?.asOf ?? asOf}:&nbsp;
            <span className="font-mono font-semibold">
              ₹{(data?.total ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </span>
          </span>
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton rows={8} cols={6} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No stock value on this date"
          description="Try a more recent as-of date, or post a GRN to add stock."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <Th>Item</Th>
              <Th>Warehouse</Th>
              <Th>Batch</Th>
              <Th className="text-right">Qty</Th>
              <Th className="text-right">Avg cost</Th>
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
                <TableCell className="text-right tabular-nums">
                  {r.qty.toLocaleString('en-IN', { maximumFractionDigits: 3 })} {r.itemUnit ?? ''}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  ₹{r.avgCost.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
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
