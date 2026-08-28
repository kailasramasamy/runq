import { Link } from '@tanstack/react-router';
import { ArrowLeftRight, PackageCheck } from 'lucide-react';
import {
  Table, TableHeader, TableBody, TableRow, TableCell, Th,
  TableSkeleton, EmptyState, Badge, Button,
} from '@/components/ui';
import { useShortages, type ShortageLine } from '@/hooks/queries/use-sales-dispatch';

/**
 * Goods billed that never left.
 *
 * Auto-dispatch has always parked the uncovered remainder on a draft DN, but
 * a draft is not a to-do list — it announced itself once in a toast and then
 * looked like every other draft in the system. This is the queue that was
 * missing: what is owed, to whom, and for how long.
 *
 * The column that makes it work is "on hand": the shortfall was measured the
 * night the van left, and by morning the shelf has usually changed. A row
 * that stock has caught up on needs nothing but a click to post, and those
 * are separated out so the morning's work isn't buried among the ones still
 * genuinely short.
 */
export function ShortagesTab({ coverableOnly, onToggleCoverable }: {
  coverableOnly: boolean;
  onToggleCoverable: (v: boolean) => void;
}) {
  const { data, isLoading } = useShortages({
    limit: 100,
    ...(coverableOnly ? { coverableOnly: true } : {}),
  });
  const rows = data?.data ?? [];
  const total = data?.total ?? rows.length;
  const readyNow = rows.filter((r) => r.coverable).length;

  if (isLoading) return <TableSkeleton rows={6} cols={6} />;
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={PackageCheck}
        title={coverableOnly ? 'Nothing ready to post' : 'Nothing short'}
        description={
          coverableOnly
            ? 'No shortfall has been covered by stock yet. Clear the filter to see what is still owed.'
            : 'Every invoiced line has been covered by stock or sent.'
        }
      />
    );
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="num text-[12px]" style={{ color: 'var(--text-3)' }}>
          {total} line{total === 1 ? '' : 's'} owed
          {readyNow > 0 && !coverableOnly && ` · ${readyNow} now coverable`}
        </span>
        <div className="flex-1" />
        <Button
          variant={coverableOnly ? 'primary' : 'secondary'}
          className="h-7 px-2 text-[12px]"
          onClick={() => onToggleCoverable(!coverableOnly)}
        >
          <PackageCheck size={13} /> Ready to post
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <Th>Item</Th>
            <Th>Customer</Th>
            <Th className="text-right">Short</Th>
            <Th className="text-right">On hand</Th>
            <Th>Waiting</Th>
            <Th className="text-right">Action</Th>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => <ShortageRow key={`${r.dnId}-${r.itemId}`} row={r} />)}
        </TableBody>
      </Table>
    </>
  );
}

function ShortageRow({ row }: { row: ShortageLine }) {
  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{row.itemName}</div>
        <div className="text-[11.5px]" style={{ color: 'var(--text-3)' }}>
          {row.itemSku ? `${row.itemSku} · ` : ''}{row.warehouseName}
        </div>
      </TableCell>
      <TableCell>
        <div>{row.customerName ?? '—'}</div>
        {row.invoiceNumber && (
          <div className="font-mono text-[11.5px]" style={{ color: 'var(--text-3)' }}>
            {row.invoiceNumber}
          </div>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {row.shortQty} {row.uom ?? ''}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        <span style={{ color: row.coverable ? undefined : 'var(--neg)' }}>{row.availableQty}</span>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-1.5">
          <AgeBadge days={row.ageDays} />
          {row.coverable && <Badge variant="success">Stock arrived</Badge>}
          {!row.coverable && row.substituteCount > 0 && (
            <Badge variant="default">
              <ArrowLeftRight size={10} className="mr-0.5 inline" />
              {row.substituteCount} substitute{row.substituteCount === 1 ? '' : 's'}
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="text-right">
        {/* Straight to the draft that holds the picked lines — posting it is
            the whole job when stock has arrived. */}
        <Link to="/inventory/delivery/$id" params={{ id: row.dnId }}>
          <Button
            variant={row.coverable ? 'primary' : 'secondary'}
            className="h-7 px-2 text-[12px]"
          >
            {row.coverable ? 'Post now' : 'Open draft'}
          </Button>
        </Link>
      </TableCell>
    </TableRow>
  );
}

/** Age is the customer's wait, so it earns colour once it stops being today. */
function AgeBadge({ days }: { days: number }) {
  if (days <= 0) return <Badge variant="default">Today</Badge>;
  if (days === 1) return <Badge variant="warning">1 day</Badge>;
  return <Badge variant={days >= 3 ? 'danger' : 'warning'}>{days} days</Badge>;
}
