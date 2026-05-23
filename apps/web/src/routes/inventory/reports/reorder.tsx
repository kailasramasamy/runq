import { AlertTriangle } from 'lucide-react';
import {
  PageHeader, Table, TableHeader, TableBody, TableRow, TableCell, Th,
  TableSkeleton, EmptyState, Badge,
} from '@/components/ui';
import { useReorderAlerts } from '@/hooks/queries/use-inventory';

export function ReorderReportPage() {
  const { data, isLoading } = useReorderAlerts();
  const rows = data ?? [];

  return (
    <div>
      <PageHeader
        title="Reorder alerts"
        description="Items at or below the effective reorder level (per-warehouse rule or item default)."
        fullWidth
      />

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
