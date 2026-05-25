import { useNavigate, useSearch } from '@tanstack/react-router';
import { Boxes, Search } from 'lucide-react';
import {
  PageHeader, Combobox, Input, Table, TableHeader, TableBody, TableRow, TableCell, Th,
  TableSkeleton, EmptyState,
} from '@/components/ui';
import { useStockSummary, useWarehouses } from '@/hooks/queries/use-inventory';
import {
  InvClassTabs, classGroupForItemClass, resolveDefaultClassGroup, type ItemClassGroup,
} from '@/components/inventory/inv-class-tabs';

type Params = { warehouseId?: string; q?: string; classGroup?: string };

function parseGroup(v: string | undefined): ItemClassGroup | null {
  return v === 'finished' || v === 'inputs' || v === 'trading' || v === 'other' || v === 'all'
    ? v
    : null;
}

export function StockSummaryReportPage() {
  const navigate = useNavigate();
  const params = useSearch({ strict: false }) as Params;
  const warehouseId = params.warehouseId ?? '';
  const q = params.q ?? '';
  const urlGroup = parseGroup(params.classGroup);

  function update(patch: Partial<Params>) {
    navigate({
      to: '/inventory/reports/summary',
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
  const { data, isLoading } = useStockSummary({ warehouseId: warehouseId || undefined });
  const allRows = data ?? [];

  // Per-bucket counts feed the tab strip + drive fall-through to the first
  // non-empty bucket when the user hasn't pinned one in the URL.
  const counts: Partial<Record<Exclude<ItemClassGroup, 'all'>, number>> = {};
  for (const r of allRows) {
    const g = classGroupForItemClass(r.itemClass) as Exclude<ItemClassGroup, 'all'>;
    counts[g] = (counts[g] ?? 0) + 1;
  }
  const classGroup: ItemClassGroup = urlGroup ?? resolveDefaultClassGroup('finished', counts);

  const ql = q.toLowerCase();
  const rows = allRows.filter((r) => {
    if (classGroup !== 'all' && classGroupForItemClass(r.itemClass) !== classGroup) return false;
    return !ql || r.itemName.toLowerCase().includes(ql) || (r.itemSku ?? '').toLowerCase().includes(ql);
  });

  const totalValue = rows.reduce((s, r) => s + r.totalValue, 0);

  const whOptions = [
    { value: '', label: 'All warehouses' },
    ...(warehouses ?? []).map((w) => ({ value: w.id, label: w.name })),
  ];

  return (
    <div>
      <PageHeader
        title="Stock summary"
        description="Per-item totals across warehouses and batches."
        fullWidth
      />

      <div className="mb-3">
        <InvClassTabs
          selected={classGroup}
          counts={counts}
          onChange={(g) => update({ classGroup: g })}
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
          <Combobox value={warehouseId} onChange={(v) => update({ warehouseId: v || undefined })} options={whOptions} />
        </div>
        <div className="ml-auto flex items-center gap-4">
          <span className="num text-[12px]" style={{ color: 'var(--text-3)' }}>{rows.length} rows</span>
          <span className="text-sm">
            Total value:&nbsp;
            <span className="font-mono font-semibold">
              ₹{totalValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </span>
          </span>
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton rows={6} cols={6} />
      ) : rows.length === 0 ? (
        <EmptyState icon={Boxes} title="No stock yet" description="Post a GRN to start tracking stock." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <Th>Item</Th>
              <Th>Category</Th>
              <Th className="text-right">Qty</Th>
              <Th className="text-right">Value</Th>
              <Th className="text-right">Warehouses</Th>
              <Th className="text-right">Batches</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.itemId}>
                <TableCell>
                  <div className="font-medium">{r.itemName}</div>
                  {r.itemSku && <div className="font-mono text-xs text-zinc-500">{r.itemSku}</div>}
                </TableCell>
                <TableCell>{r.category ?? '—'}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.totalQty.toLocaleString('en-IN', { maximumFractionDigits: 3 })} {r.itemUnit ?? ''}
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  ₹{r.totalValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </TableCell>
                <TableCell className="text-right tabular-nums">{r.warehouseCount}</TableCell>
                <TableCell className="text-right tabular-nums">{r.batchCount > 0 ? r.batchCount : '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
