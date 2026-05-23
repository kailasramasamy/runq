import { useState } from 'react';
import { History } from 'lucide-react';
import {
  PageHeader, Combobox, Table, TableHeader, TableBody, TableRow, TableCell, Th,
  TableSkeleton, EmptyState, Card, CardContent, Badge,
} from '@/components/ui';
import { useAgeing, useWarehouses } from '@/hooks/queries/use-inventory';

const BUCKET_TONES: Record<string, 'default' | 'success' | 'info' | 'warning' | 'danger'> = {
  '0-30': 'success',
  '31-60': 'info',
  '61-90': 'default',
  '91-180': 'warning',
  '180+': 'danger',
};

export function AgeingReportPage() {
  const { data: warehouses } = useWarehouses();
  const [warehouseId, setWarehouseId] = useState('');
  const { data, isLoading } = useAgeing({ warehouseId: warehouseId || undefined });

  const whOptions = [
    { value: '', label: 'All warehouses' },
    ...(warehouses ?? []).map((w) => ({ value: w.id, label: w.name })),
  ];

  const buckets = data?.buckets ?? [];
  const totals = data?.totals ?? {};
  const rows = data?.rows ?? [];

  return (
    <div>
      <PageHeader
        title="Stock ageing"
        description="How long today's on-hand has been sitting. Older buckets = slow-movers and write-off risk."
        fullWidth
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[220px]">
          <label className="mb-1 block text-xs font-medium text-zinc-500">Warehouse</label>
          <Combobox value={warehouseId} onChange={setWarehouseId} options={whOptions} />
        </div>
      </div>

      {!isLoading && rows.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
          {buckets.map((b) => {
            const t = totals[b] ?? { qty: 0, value: 0, count: 0 };
            return (
              <Card key={b}>
                <CardContent>
                  <div className="mb-2 text-xs font-medium text-zinc-500">{b} days</div>
                  <div className="text-lg font-mono font-semibold tabular-nums">
                    ₹{t.value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {t.count} {t.count === 1 ? 'line' : 'lines'}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {isLoading ? (
        <TableSkeleton rows={8} cols={7} />
      ) : rows.length === 0 ? (
        <EmptyState icon={History} title="No on-hand stock" description="Nothing to age." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <Th>Item</Th>
              <Th>Warehouse</Th>
              <Th>Batch</Th>
              <Th>Last in</Th>
              <Th className="text-right">Age (days)</Th>
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
                <TableCell className="text-xs text-zinc-500">{r.lastInboundDate ?? '—'}</TableCell>
                <TableCell className="text-right tabular-nums">
                  <Badge variant={BUCKET_TONES[r.bucket] ?? 'default'}>
                    {r.ageDays != null ? `${r.ageDays}d` : 'old'}
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
