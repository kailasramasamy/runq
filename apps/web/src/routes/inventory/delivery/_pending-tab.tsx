import { Link } from '@tanstack/react-router';
import { Clock, Truck } from 'lucide-react';
import {
  Table, TableHeader, TableBody, TableRow, TableCell, Th,
  TableSkeleton, EmptyState, Badge, Button,
} from '@/components/ui';
import { usePendingDispatches, type PendingInvoice } from '@/hooks/queries/use-sales-dispatch';

/**
 * "Awaiting dispatch" — issued invoices whose goods haven't left yet.
 *
 * `from` matters operationally: a tenant switching this on mid-life has years
 * of invoices that were never dispatch-tracked, and without a floor the queue
 * opens with all of them. The list page passes a default start date.
 */
export function PendingDispatchTab({ from, q }: { from?: string; q?: string }) {
  const { data, isLoading } = usePendingDispatches({ from, q, limit: 100 });
  const rows = data?.data ?? [];

  if (isLoading) return <TableSkeleton rows={6} cols={5} />;
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Clock}
        title="Nothing awaiting dispatch"
        description="Every issued invoice has had its goods sent."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <Th>Invoice</Th>
          <Th>Date</Th>
          <Th>Customer</Th>
          <Th>Lines</Th>
          <Th className="text-right">Value</Th>
          <Th className="text-right">Action</Th>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => <PendingRow key={r.id} row={r} />)}
      </TableBody>
    </Table>
  );
}

function PendingRow({ row }: { row: PendingInvoice }) {
  const unmapped = row.lineCount - row.stockableCount;
  return (
    <TableRow>
      <TableCell className="font-mono">{row.invoiceNumber}</TableCell>
      <TableCell>{row.invoiceDate}</TableCell>
      <TableCell>{row.customerName}</TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12px]">{row.stockableCount} of {row.lineCount} stockable</span>
          {unmapped > 0 && <Badge variant="warning">{unmapped} unmapped</Badge>}
          {row.dispatchedCount > 0 && <Badge variant="default">Part sent</Badge>}
          {row.openDraftDnId && <Badge variant="default">Draft open</Badge>}
        </div>
      </TableCell>
      <TableCell className="text-right tabular-nums">
        ₹{Number(row.totalAmount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
      </TableCell>
      <TableCell className="text-right">
        {row.openDraftDnId ? (
          <Link to="/inventory/delivery/$id" params={{ id: row.openDraftDnId }}>
            <Button variant="secondary" className="h-7 px-2 text-[12px]">Open draft</Button>
          </Link>
        ) : (
          <Link to="/inventory/delivery/from-invoice/$id" params={{ id: row.id }}>
            <Button variant="primary" className="h-7 px-2 text-[12px]"><Truck size={13} /> Dispatch</Button>
          </Link>
        )}
      </TableCell>
    </TableRow>
  );
}
