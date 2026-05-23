import { useState } from 'react';
import { NotebookPen } from 'lucide-react';
import {
  PageHeader, Combobox, Select, Table, TableHeader, TableBody, TableRow, TableCell, Th,
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

export function StockLedgerPage() {
  const { data: warehouses } = useWarehouses();
  const [warehouseId, setWarehouseId] = useState('');
  const [movementType, setMovementType] = useState('');
  const { data, isLoading } = useLedger({
    warehouseId: warehouseId || undefined,
    movementType: movementType || undefined,
    limit: 200,
  });

  const whOptions = [
    { value: '', label: 'All warehouses' },
    ...(warehouses ?? []).map((w) => ({ value: w.id, label: w.name })),
  ];

  return (
    <div>
      <PageHeader title="Stock ledger" description="Every movement, every batch, immutable." fullWidth />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[200px]">
          <label className="mb-1 block text-xs font-medium text-zinc-500">Warehouse</label>
          <Combobox value={warehouseId} onChange={setWarehouseId} options={whOptions} />
        </div>
        <div className="min-w-[180px]">
          <label className="mb-1 block text-xs font-medium text-zinc-500">Movement</label>
          <Select
            value={movementType}
            onChange={(e) => setMovementType(e.target.value)}
            options={[
              { value: '', label: 'All movements' },
              ...Object.entries(MOVEMENT_LABELS).map(([k, v]) => ({ value: k, label: v })),
            ]}
          />
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton rows={8} cols={8} />
      ) : !data || data.length === 0 ? (
        <EmptyState icon={NotebookPen} title="No movements" description="No stock movements match the filters." />
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
            {data.map((r) => (
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
