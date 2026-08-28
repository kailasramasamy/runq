// Item stock audit trail — every movement for one item, with the document
// that caused it. Finished goods leave on a delivery note (linked through to
// its sales invoice); raw materials leave on a work order (with the BOM that
// consumed them); stock arrives on a GRN or a production run.
//
// Defaults to the last 90 days — high-turnover SKUs post thousands of rows a
// month and an unbounded first page is unusable.

import { useMemo, useState } from 'react';
import { Link, useNavigate, useRouter } from '@tanstack/react-router';
import { ArrowLeft, ExternalLink, History } from 'lucide-react';
import {
  PageHeader, Card, CardContent, Button, Combobox, Input, Badge,
  Table, TableHeader, TableBody, TableRow, TableCell, Th,
  TableSkeleton, EmptyState,
} from '@/components/ui';
import { formatINR, formatItemQty } from '@/lib/utils';
import { useItem } from '@/hooks/queries/use-items';
import {
  useItemMovements, useWarehouses,
  type ItemMovementRow, type MovementDocRef,
} from '@/hooks/queries/use-inventory';

const MOVEMENT_LABELS: Record<string, string> = {
  grn: 'Receipt', delivery: 'Dispatch',
  transfer_in: 'Transfer in', transfer_out: 'Transfer out',
  adjustment_in: 'Adjustment +', adjustment_out: 'Adjustment −',
  opening: 'Opening', reversal: 'Reversal',
  stock_take_in: 'Count +', stock_take_out: 'Count −',
  production_in: 'Produced', production_out: 'Consumed',
  sales_return_in: 'Customer return',
  reclaim_out: 'Reclaimed', reclaim_in: 'Recovered',
};

const DIRECTION_OPTIONS = [
  { value: '', label: 'In and out' },
  { value: 'in', label: 'Stock added' },
  { value: 'out', label: 'Stock removed' },
];

const PAGE_SIZE = 50;

/** Where each resolved document lives in the app. Null = no detail page. */
function docHref(ref: MovementDocRef): string | null {
  switch (ref.kind) {
    case 'grn': return `/inventory/grn/${ref.id}`;
    case 'delivery_note': return `/inventory/delivery/${ref.id}`;
    case 'transfer': return `/inventory/transfers/${ref.id}`;
    case 'adjustment': return `/inventory/adjustments/${ref.id}`;
    case 'stock_take': return `/inventory/stock-take/${ref.id}`;
    case 'work_order': return `/manufacturing/wos/${ref.id}`;
    case 'reclaim': return `/manufacturing/reclaims/${ref.id}`;
    case 'bom': return `/manufacturing/boms/${ref.id}`;
    case 'invoice': return `/finance/ar/invoices/${ref.id}`;
    case 'bill': return `/finance/ap/bills/${ref.id}`;
    case 'purchase_order': return `/purchase/pos/${ref.id}`;
    default: return null;
  }
}

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function ItemMovementsPage({ itemId }: { itemId: string }) {
  const navigate = useNavigate();
  const router = useRouter();
  const { data: itemData } = useItem(itemId);
  const item = itemData?.data;

  const [warehouseId, setWarehouseId] = useState('');
  const [direction, setDirection] = useState('');
  const [from, setFrom] = useState(() => isoDaysAgo(90));
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const { data: warehouses } = useWarehouses();
  const filter = useMemo(
    () => ({ warehouseId, direction, from, to, page, limit: PAGE_SIZE }),
    [warehouseId, direction, from, to, page],
  );
  const { data, isLoading } = useItemMovements(itemId, filter);
  const rows = data?.rows ?? [];

  function reset<T>(setter: (v: T) => void) {
    return (v: T) => { setter(v); setPage(1); };
  }

  const whOptions = [
    { value: '', label: 'All warehouses' },
    ...(warehouses ?? []).map((w) => ({ value: w.id, label: w.name })),
  ];

  const added = rows.filter((r) => r.direction === 'in').reduce((a, r) => a + r.qtyIn, 0);
  const removed = rows.filter((r) => r.direction === 'out').reduce((a, r) => a + r.qtyOut, 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Stock movements — ${item?.name ?? ''}`}
        breadcrumbs={[
          { label: 'Masters' },
          { label: 'Items', href: '/masters/items' },
          { label: 'Stock movements' },
        ]}
        description="Every quantity change for this item, with the document behind it."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              // History-back keeps the user in whichever module prefix they
              // came from (/finance, /inventory, /purchase).
              if (router.history.canGoBack()) router.history.back();
              else navigate({ to: '/finance/masters/items/$itemId/edit', params: { itemId } });
            }}
          >
            <ArrowLeft size={14} /> Back to Item
          </Button>
        }
      />

      <div className="flex flex-wrap items-end gap-2">
        <Combobox
          options={whOptions}
          value={warehouseId}
          onChange={reset(setWarehouseId)}
          placeholder="All warehouses"
          inputClassName="h-8 py-0 text-[12.5px]"
        />
        <Combobox
          options={DIRECTION_OPTIONS}
          value={direction}
          onChange={reset(setDirection)}
          placeholder="In and out"
          inputClassName="h-8 py-0 text-[12.5px]"
        />
        <Input
          type="date"
          value={from}
          onChange={(e) => reset(setFrom)(e.target.value)}
          className="h-8 w-36 py-0 text-[12.5px]"
        />
        <Input
          type="date"
          value={to}
          onChange={(e) => reset(setTo)(e.target.value)}
          className="h-8 w-36 py-0 text-[12.5px]"
        />
        <div className="flex-1" />
        <span className="num text-[12px]" style={{ color: 'var(--text-3)' }}>
          +{added.toLocaleString('en-IN', { maximumFractionDigits: 3 })} /
          −{formatItemQty(removed, item?.itemClass, item?.unit)} {item?.unit ?? ''} on this page
        </span>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <TableSkeleton rows={8} cols={9} />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={History}
              title="No movements in this window"
              description="Widen the date range or clear the warehouse filter."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <Th>Date</Th>
                  <Th>Movement</Th>
                  <Th>Document</Th>
                  <Th>Details</Th>
                  <Th>Batch</Th>
                  <Th className="text-right">In</Th>
                  <Th className="text-right">Out</Th>
                  <Th className="text-right">Rate</Th>
                  <Th className="text-right">Balance</Th>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <MovementRow
                    key={r.id}
                    row={r}
                    itemClass={item?.itemClass}
                    unit={item?.unit}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {(page > 1 || data?.hasMore) && (
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="num text-[12px]" style={{ color: 'var(--text-3)' }}>Page {page}</span>
          <Button variant="outline" size="sm" disabled={!data?.hasMore} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

function MovementRow({ row, itemClass, unit }: {
  row: ItemMovementRow;
  /** The trail is scoped to one item, so the screen knows how its quantities
   *  should read even though ledger rows don't carry the item's own fields. */
  itemClass?: string | null;
  unit?: string | null;
}) {
  const doc = row.doc;
  const href = doc ? docHref(doc) : null;
  const refHref = doc?.ref ? docHref(doc.ref) : null;

  return (
    <TableRow>
      {/* Day off `movedAt` (the day the movement belongs to, even when
          backdated); clock off `postedAt` — a dispatch stamps `movedAt` at
          midnight, so reading the time off it printed 12:00 am on every row. */}
      <TableCell className="whitespace-nowrap text-xs text-zinc-600 dark:text-zinc-400">
        {new Date(row.movedAt).toLocaleDateString('en-IN', {
          day: '2-digit', month: 'short', year: '2-digit',
        })}
        {', '}
        {new Date(row.postedAt).toLocaleTimeString('en-IN', {
          hour: '2-digit', minute: '2-digit',
        })}
      </TableCell>
      <TableCell>
        <Badge variant={row.direction === 'in' ? 'success' : 'default'}>
          {MOVEMENT_LABELS[row.movementType] ?? row.movementType}
        </Badge>
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {doc ? (
          href ? (
            <Link to={href as never} className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:underline dark:text-indigo-400">
              {doc.no} <ExternalLink size={11} />
            </Link>
          ) : (
            <span className="font-medium">{doc.no}</span>
          )
        ) : (
          <span className="text-zinc-400">—</span>
        )}
      </TableCell>
      <TableCell className="max-w-[22rem]">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[12.5px]">{doc?.party ?? doc?.note ?? '—'}</span>
          {/* Called out, not tucked into the meta line: this row is the one
              most likely to be mistaken for a sale of this item. */}
          {doc?.substitutedFor && <Badge variant="warning">Substitution</Badge>}
        </div>
        {doc?.substitutedFor && (
          <div className="truncate text-[11px]" style={{ color: 'var(--warn)' }}>
            Sent in place of {doc.substitutedFor}
          </div>
        )}
        <div className="flex items-center gap-2 text-[11px] text-zinc-500">
          {doc?.party && doc?.note && <span className="truncate">{doc.note}</span>}
          {doc?.ref && (
            refHref ? (
              <Link to={refHref as never} className="inline-flex items-center gap-0.5 text-indigo-600 hover:underline dark:text-indigo-400">
                {doc.ref.label}: {doc.ref.no}
              </Link>
            ) : (
              <span>{doc.ref.label}: {doc.ref.no}</span>
            )
          )}
          <span>{row.warehouseName}</span>
          {row.postedByName && <span>· {row.postedByName}</span>}
        </div>
      </TableCell>
      <TableCell className="font-mono text-xs">{row.batchNo || '—'}</TableCell>
      <TableCell className="text-right tabular-nums text-green-600">
        {row.qtyIn > 0 ? formatItemQty(row.qtyIn, itemClass, unit) : ''}
      </TableCell>
      <TableCell className="text-right tabular-nums text-red-600">
        {row.qtyOut > 0 ? formatItemQty(row.qtyOut, itemClass, unit) : ''}
      </TableCell>
      <TableCell className="text-right tabular-nums text-xs text-zinc-500">
        {row.unitCost ? formatINR(row.unitCost) : '—'}
      </TableCell>
      <TableCell className="text-right tabular-nums font-medium">
        {row.runningQty.toLocaleString('en-IN', { maximumFractionDigits: 3 })}
      </TableCell>
    </TableRow>
  );
}
