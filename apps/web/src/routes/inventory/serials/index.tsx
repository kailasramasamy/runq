import { useState } from 'react';
import { Tags } from 'lucide-react';
import {
  PageHeader, Select, Table, TableHeader, TableBody, TableRow, TableCell, Th,
  TableSkeleton, EmptyState, Badge, Combobox,
} from '@/components/ui';
import { useSerialList, useWarehouses } from '@/hooks/queries/use-inventory';

type SerialStatus = 'in_stock' | 'sold' | 'returned' | 'scrapped' | 'in_transit';

const STATUS_TONES: Record<SerialStatus, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
  in_stock: 'success',
  sold: 'info',
  returned: 'warning',
  scrapped: 'danger',
  in_transit: 'info',
};

export function SerialListPage() {
  const { data: warehouses } = useWarehouses();
  const [status, setStatus] = useState<'' | SerialStatus>('');
  const [warehouseId, setWarehouseId] = useState('');
  const { data, isLoading } = useSerialList({
    status: status || undefined,
    warehouseId: warehouseId || undefined,
  });
  const rows = data?.data ?? [];

  const whOptions = [
    { value: '', label: 'All warehouses' },
    ...(warehouses ?? []).map((w) => ({ value: w.id, label: w.name })),
  ];

  return (
    <div>
      <PageHeader
        title="Serials"
        description="Per-unit serial tracking. Captured on GRN line save (Phase 4) — lookup powers warranty / RMA."
        fullWidth
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[180px]">
          <label className="mb-1 block text-xs font-medium text-zinc-500">Status</label>
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            options={[
              { value: '', label: 'All' },
              { value: 'in_stock', label: 'In stock' },
              { value: 'sold', label: 'Sold' },
              { value: 'returned', label: 'Returned' },
              { value: 'scrapped', label: 'Scrapped' },
              { value: 'in_transit', label: 'In transit' },
            ]}
          />
        </div>
        <div className="min-w-[220px]">
          <label className="mb-1 block text-xs font-medium text-zinc-500">Warehouse</label>
          <Combobox value={warehouseId} onChange={setWarehouseId} options={whOptions} />
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton rows={6} cols={6} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Tags}
          title="No serials captured yet"
          description="Serial capture lands in Phase 4. Mark an item as 'tracks serials' and scan units on GRN."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <Th>Serial #</Th>
              <Th>Item</Th>
              <Th>Batch</Th>
              <Th>Warehouse</Th>
              <Th>Status</Th>
              <Th>Updated</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-mono">{s.serialNo}</TableCell>
                <TableCell>
                  <div className="font-medium">{s.itemName}</div>
                  {s.itemSku && <div className="font-mono text-xs text-zinc-500">{s.itemSku}</div>}
                </TableCell>
                <TableCell className="font-mono text-xs">{s.batchNo ?? '—'}</TableCell>
                <TableCell>{s.warehouseName ?? '—'}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_TONES[s.currentStatus]}>
                    {s.currentStatus.replace('_', ' ')}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-zinc-500">{s.updatedAt.slice(0, 16).replace('T', ' ')}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
