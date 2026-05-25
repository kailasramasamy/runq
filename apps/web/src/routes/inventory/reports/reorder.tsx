import { useNavigate, useSearch } from '@tanstack/react-router';
import { AlertTriangle, Search } from 'lucide-react';
import {
  PageHeader, Combobox, Input, Table, TableHeader, TableBody, TableRow, TableCell, Th,
  TableSkeleton, EmptyState, Badge,
} from '@/components/ui';
import { useReorderAlerts, useWarehouses } from '@/hooks/queries/use-inventory';

type Params = { warehouseId?: string; q?: string };

export function ReorderReportPage() {
  const navigate = useNavigate();
  const params = useSearch({ strict: false }) as Params;
  const warehouseId = params.warehouseId ?? '';
  const q = params.q ?? '';

  function update(patch: Partial<Params>) {
    navigate({
      to: '/inventory/reports/reorder',
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
  const { data, isLoading } = useReorderAlerts();
  const allRows = data ?? [];

  const ql = q.toLowerCase();
  const whFilter = warehouseId;
  const rows = allRows.filter((r) => {
    if (whFilter && r.warehouseId !== whFilter) return false;
    if (ql) {
      return (
        r.itemName.toLowerCase().includes(ql) ||
        (r.itemSku ?? '').toLowerCase().includes(ql) ||
        r.warehouseName.toLowerCase().includes(ql)
      );
    }
    return true;
  });

  const whOptions = [
    { value: '', label: 'All warehouses' },
    ...(warehouses ?? []).map((w) => ({ value: w.id, label: w.name })),
  ];

  return (
    <div>
      <PageHeader
        title="Reorder alerts"
        description="Items at or below the effective reorder level (per-warehouse rule or item default)."
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
        <div className="min-w-[220px]">
          <label className="mb-1 block text-xs font-medium text-zinc-500">Warehouse</label>
          <Combobox value={warehouseId} onChange={(v) => update({ warehouseId: v || undefined })} options={whOptions} />
        </div>
        <span className="num ml-auto text-[12px]" style={{ color: 'var(--text-3)' }}>
          {rows.length} rows
        </span>
      </div>

      {isLoading ? (
        <TableSkeleton rows={6} cols={6} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={AlertTriangle}
          title="All stock above reorder level"
          description="Nothing needs reordering right now."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <Th>Item</Th>
              <Th>Warehouse</Th>
              <Th className="text-right">On hand</Th>
              <Th className="text-right">Reorder at</Th>
              <Th className="text-right">Short by</Th>
              <Th className="text-right">Reorder qty</Th>
              <Th className="text-right">Lead days</Th>
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
                <TableCell className="text-right tabular-nums">
                  {r.onHand.toLocaleString('en-IN', { maximumFractionDigits: 3 })} {r.itemUnit ?? ''}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.reorderLevel.toLocaleString('en-IN', { maximumFractionDigits: 3 })}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.shortBy > 0 ? (
                    <Badge variant="warning">{r.shortBy.toLocaleString('en-IN', { maximumFractionDigits: 3 })}</Badge>
                  ) : '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.reorderQty.toLocaleString('en-IN', { maximumFractionDigits: 3 })}
                </TableCell>
                <TableCell className="text-right tabular-nums">{r.leadTimeDays ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
