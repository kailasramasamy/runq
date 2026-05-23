import { useState } from 'react';
import { Boxes } from 'lucide-react';
import {
  PageHeader, Combobox, Table, TableHeader, TableBody, TableRow, TableCell, Th,
  TableSkeleton, EmptyState,
} from '@/components/ui';
import { useStockSummary, useWarehouses } from '@/hooks/queries/use-inventory';

export function StockSummaryReportPage() {
  const { data: warehouses } = useWarehouses();
  const [warehouseId, setWarehouseId] = useState('');
  const { data, isLoading } = useStockSummary({ warehouseId: warehouseId || undefined });
  const rows = data ?? [];

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

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[220px]">
          <label className="mb-1 block text-xs font-medium text-zinc-500">Warehouse</label>
          <Combobox value={warehouseId} onChange={setWarehouseId} options={whOptions} />
        </div>
        <div className="ml-auto text-sm">
          Total value:&nbsp;
          <span className="font-mono font-semibold">
            ₹{totalValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
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
