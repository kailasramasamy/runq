import { useState } from 'react';
import { PackageX } from 'lucide-react';
import {
  PageHeader, Combobox, Select, Table, TableHeader, TableBody, TableRow, TableCell, Th,
  TableSkeleton, EmptyState, Badge,
} from '@/components/ui';
import { useDeadStock, useWarehouses } from '@/hooks/queries/use-inventory';

export function DeadStockReportPage() {
  const { data: warehouses } = useWarehouses();
  const [warehouseId, setWarehouseId] = useState('');
  const [days, setDays] = useState(90);
  const { data, isLoading } = useDeadStock({
    warehouseId: warehouseId || undefined, daysSinceMovement: days,
  });
  const rows = data ?? [];

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
        <div className="min-w-[180px]">
          <label className="mb-1 block text-xs font-medium text-zinc-500">No movement for</label>
          <Select
            value={String(days)}
            onChange={(e) => setDays(Number(e.target.value))}
            options={[
              { value: '30', label: '30+ days' },
              { value: '60', label: '60+ days' },
              { value: '90', label: '90+ days' },
              { value: '180', label: '180+ days' },
              { value: '365', label: '365+ days' },
            ]}
          />
        </div>
        <div className="min-w-[220px]">
          <label className="mb-1 block text-xs font-medium text-zinc-500">Warehouse</label>
          <Combobox value={warehouseId} onChange={setWarehouseId} options={whOptions} />
        </div>
        <div className="ml-auto text-sm">
          Frozen value:&nbsp;
          <span className="font-mono font-semibold">
            ₹{totalValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
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
