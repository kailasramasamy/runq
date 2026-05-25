import { useNavigate, useSearch } from '@tanstack/react-router';
import { NotebookPen, Search } from 'lucide-react';
import {
  PageHeader, Input, Combobox, Table, TableHeader, TableBody, TableRow, TableCell, Th,
  TableSkeleton, EmptyState, Badge,
} from '@/components/ui';
import { useLedger, useWarehouses } from '@/hooks/queries/use-inventory';

const MOVEMENT_LABELS: Record<string, string> = {
  grn: 'Receipt', delivery: 'Dispatch',
  transfer_in: 'Transfer in', transfer_out: 'Transfer out',
  adjustment_in: 'Adj. +', adjustment_out: 'Adj. −',
  opening: 'Opening', reversal: 'Reversal',
  stock_take_in: 'Count +', stock_take_out: 'Count −',
};

const MOVEMENT_OPTIONS = [
  { value: '', label: 'All movements' },
  ...Object.entries(MOVEMENT_LABELS).map(([k, v]) => ({ value: k, label: v })),
];

type Params = { q?: string; warehouseId?: string; movementType?: string };

export function StockLedgerPage() {
  const navigate = useNavigate();
  const params = useSearch({ strict: false }) as Params;
  const search = params.q ?? '';
  const warehouseId = params.warehouseId ?? '';
  const movementType = params.movementType ?? '';

  function updateSearch(patch: Partial<Params>) {
    navigate({
      to: '/inventory/stock/ledger',
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
  const { data, isLoading } = useLedger({
    warehouseId: warehouseId || undefined,
    movementType: movementType || undefined,
    limit: 200,
  });

  const allRows = data ?? [];
  const rows = allRows.filter((r) => {
    const q = search.toLowerCase();
    return !q ||
      r.itemName.toLowerCase().includes(q) ||
      (r.itemSku ?? '').toLowerCase().includes(q) ||
      r.warehouseName.toLowerCase().includes(q) ||
      r.sourceId.toLowerCase().includes(q);
  });

  const whOptions = [
    { value: '', label: 'All warehouses' },
    ...(warehouses ?? []).map((w) => ({ value: w.id, label: w.name })),
  ];

  const hasFilters = !!search || !!warehouseId || !!movementType;

  return (
    <div>
      <PageHeader title="Stock ledger" description="Every movement, every batch, immutable." fullWidth />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="w-72 max-w-full">
          <Input
            icon={<Search size={13} />}
            placeholder="Search item or warehouse…"
            value={search}
            onChange={(e) => updateSearch({ q: e.target.value || undefined })}
          />
        </div>
        <Combobox
          options={whOptions}
          value={warehouseId}
          onChange={(v) => updateSearch({ warehouseId: v || undefined })}
          placeholder="All warehouses"
          inputClassName="h-8 py-0 text-[12.5px]"
        />
        <Combobox
          options={MOVEMENT_OPTIONS}
          value={movementType}
          onChange={(v) => updateSearch({ movementType: v || undefined })}
          placeholder="All movements"
          inputClassName="h-8 py-0 text-[12.5px]"
        />
        <div className="flex-1" />
        <span className="num text-[12px]" style={{ color: 'var(--text-3)' }}>{rows.length} movements</span>
      </div>

      {isLoading ? (
        <TableSkeleton rows={8} cols={8} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={NotebookPen}
          title={hasFilters ? 'No movements match your filters' : 'No movements'}
          description={hasFilters ? 'Try adjusting your search or filters.' : 'No stock movements match the filters.'}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <Th>Date</Th>
              <Th>Movement</Th>
              <Th>Item</Th>
              <Th>Warehouse</Th>
              <Th>Batch</Th>
              <Th className="text-right">In</Th>
              <Th className="text-right">Out</Th>
              <Th className="text-right">Running qty</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap text-xs text-zinc-600 dark:text-zinc-400">
                  {new Date(r.movedAt).toLocaleString('en-IN', {
                    day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit',
                  })}
                </TableCell>
                <TableCell><Badge>{MOVEMENT_LABELS[r.movementType] ?? r.movementType}</Badge></TableCell>
                <TableCell className="font-medium">{r.itemName}</TableCell>
                <TableCell>{r.warehouseName}</TableCell>
                <TableCell className="font-mono text-xs">{r.batchNo || '—'}</TableCell>
                <TableCell className="text-right tabular-nums text-green-600">
                  {r.qtyIn > 0 ? r.qtyIn.toLocaleString('en-IN', { maximumFractionDigits: 3 }) : ''}
                </TableCell>
                <TableCell className="text-right tabular-nums text-red-600">
                  {r.qtyOut > 0 ? r.qtyOut.toLocaleString('en-IN', { maximumFractionDigits: 3 }) : ''}
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {r.runningQty.toLocaleString('en-IN', { maximumFractionDigits: 3 })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
