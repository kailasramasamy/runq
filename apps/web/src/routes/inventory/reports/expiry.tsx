import { useState } from 'react';
import { CalendarClock } from 'lucide-react';
import {
  PageHeader, Select, Table, TableHeader, TableBody, TableRow, TableCell, Th,
  TableSkeleton, EmptyState, Badge,
} from '@/components/ui';
import { useExpiring } from '@/hooks/queries/use-inventory';

export function ExpiryReportPage() {
  const [withinDays, setWithinDays] = useState(30);
  const [includeExpired, setIncludeExpired] = useState(false);
  const { data, isLoading } = useExpiring({ withinDays, includeExpired });
  const rows = data ?? [];

  return (
    <div>
      <PageHeader
        title="Batch expiry"
        description="Batches in stock with an expiry date inside the window. Use it to drive FEFO dispatch and discount runs."
        fullWidth
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[160px]">
          <label className="mb-1 block text-xs font-medium text-zinc-500">Within (days)</label>
          <Select
            value={String(withinDays)}
            onChange={(e) => setWithinDays(Number(e.target.value))}
            options={[
              { value: '7', label: 'Next 7 days' },
              { value: '15', label: 'Next 15 days' },
              { value: '30', label: 'Next 30 days' },
              { value: '60', label: 'Next 60 days' },
              { value: '90', label: 'Next 90 days' },
              { value: '180', label: 'Next 180 days' },
            ]}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={includeExpired} onChange={(e) => setIncludeExpired(e.target.checked)} />
          Include already-expired batches
        </label>
      </div>

      {isLoading ? (
        <TableSkeleton rows={6} cols={7} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No batches expiring in this window"
          description="Try widening the window or include already-expired batches."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <Th>Item</Th>
              <Th>Warehouse</Th>
              <Th>Batch</Th>
              <Th>Expiry</Th>
              <Th className="text-right">Days</Th>
              <Th className="text-right">Qty</Th>
              <Th className="text-right">Value</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={`${r.itemId}-${r.warehouseId}-${r.batchNo}`}>
                <TableCell>
                  <div className="font-medium">{r.itemName}</div>
                  {r.itemSku && <div className="font-mono text-xs text-zinc-500">{r.itemSku}</div>}
                </TableCell>
                <TableCell>{r.warehouseName}</TableCell>
                <TableCell className="font-mono text-xs">{r.batchNo}</TableCell>
                <TableCell>{r.expiryDate}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.daysToExpiry < 0
                    ? <Badge variant="danger">{Math.abs(r.daysToExpiry)}d ago</Badge>
                    : r.daysToExpiry <= 7
                      ? <Badge variant="warning">{r.daysToExpiry}d</Badge>
                      : r.daysToExpiry}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.qty.toLocaleString('en-IN', { maximumFractionDigits: 3 })} {r.itemUnit ?? ''}
                </TableCell>
                <TableCell className="text-right tabular-nums">
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
