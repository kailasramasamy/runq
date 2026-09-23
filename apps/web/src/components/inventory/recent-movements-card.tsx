import { Link } from '@tanstack/react-router';
import { History } from 'lucide-react';
import { Card, CardContent, Skeleton, EmptyState } from '@/components/ui';
import type { MovementDocRef, RecentActivityRow } from '@/hooks/queries/use-inventory';

/**
 * Home's movement feed.
 *
 * A ledger row on its own ("Cow Milk 1L · Main · 2h ago") says almost nothing
 * — the question anyone asks of it is *which document, for whom, out of which
 * batch, worth how much*. So every row carries its resolved document, the
 * counterparty, the batch and the value, and links straight to the document.
 */
export function RecentMovementsCard({ rows }: { rows: RecentActivityRow[] | undefined }) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">
          Recent movements
        </h2>
        {rows && rows.length > 0 && (
          <Link
            to="/inventory/stock/ledger"
            className="text-xs font-medium text-primary hover:underline"
          >
            View all
          </Link>
        )}
      </div>
      <Card>
        <CardContent className="!p-0">
          {!rows ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={History}
              title="No movements yet"
              description="Post a GRN to start seeing activity here."
            />
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {rows.slice(0, 8).map((r) => <MovementRow key={r.id} row={r} />)}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MovementRow({ row }: { row: RecentActivityRow }) {
  const qty = row.qtyIn > 0 ? row.qtyIn : row.qtyOut;
  const isIn = row.qtyIn > 0;
  const meta = [
    row.warehouseName,
    row.batchNo ? `Batch ${row.batchNo}` : null,
    row.doc?.note,
    row.postedByName,
    formatTime(row.postedAt ?? row.movedAt),
  ].filter(Boolean).join(' · ');

  return (
    <li className="flex items-start gap-3 p-3">
      <MovementBadge type={row.movementType} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="truncate text-sm font-medium">{row.itemName}</span>
          {row.itemSku && (
            <span className="font-mono text-[11px] text-zinc-400">{row.itemSku}</span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-xs">
          <DocLink doc={row.doc} />
          {row.doc?.party && <span className="text-zinc-600 dark:text-zinc-400">{row.doc.party}</span>}
          {row.doc?.ref && (
            <span className="text-zinc-500">
              {row.doc.ref.label ?? 'Ref'} <DocLink doc={row.doc.ref} />
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate text-xs text-zinc-500">{meta}</div>
      </div>
      <div className="shrink-0 text-right tabular-nums">
        <div className={`text-sm font-semibold ${isIn ? 'text-green-600' : 'text-red-600'}`}>
          {isIn ? '+' : '−'}
          {qty.toLocaleString('en-IN', { maximumFractionDigits: 3 })}
          <span className="ml-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
            {row.itemUnit ?? ''}
          </span>
        </div>
        {/* Zero is legitimate — MP raw milk is capitalised at cycle lock, not
            at receipt — so a 0 line would read as a missing figure, not a fact. */}
        {row.value !== 0 && (
          <div className="font-mono text-xs text-zinc-500">
            ₹{Math.abs(row.value).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </div>
        )}
      </div>
    </li>
  );
}

/** Document number, linked when the web app has a page for that kind. */
function DocLink({ doc }: { doc: MovementDocRef | null | undefined }) {
  if (!doc) return null;
  const cls = 'font-medium';
  const route = docRoute(doc);
  if (!route) return <span className={`${cls} text-zinc-700 dark:text-zinc-300`}>{doc.no}</span>;
  return (
    <Link
      to={route.to as never}
      params={route.params as never}
      className={`${cls} hover:underline`}
      style={{ color: 'var(--accent-text)' }}
    >
      {doc.no}
    </Link>
  );
}

function docRoute(doc: MovementDocRef): { to: string; params: Record<string, string> } | null {
  switch (doc.kind) {
    case 'grn':            return { to: '/inventory/grn/$id', params: { id: doc.id } };
    case 'delivery_note':  return { to: '/inventory/delivery/$id', params: { id: doc.id } };
    case 'transfer':       return { to: '/inventory/transfers/$id', params: { id: doc.id } };
    case 'adjustment':     return { to: '/inventory/adjustments/$id', params: { id: doc.id } };
    case 'stock_take':     return { to: '/inventory/stock-take/$id', params: { id: doc.id } };
    case 'work_order':     return { to: '/manufacturing/wos/$woId', params: { woId: doc.id } };
    case 'invoice':        return { to: '/ar/invoices/$invoiceId', params: { invoiceId: doc.id } };
    case 'bill':           return { to: '/ap/bills/$billId', params: { billId: doc.id } };
    default:               return null;
  }
}

function MovementBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    grn:             { label: 'IN',  cls: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400' },
    delivery:        { label: 'OUT', cls: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400' },
    transfer_in:     { label: 'T-IN', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400' },
    transfer_out:    { label: 'T-OUT', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400' },
    adjustment_in:   { label: 'ADJ+', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400' },
    adjustment_out:  { label: 'ADJ−', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400' },
    opening:         { label: 'OPEN', cls: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400' },
    reversal:        { label: 'REV', cls: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400' },
    stock_take_in:   { label: 'ST+', cls: 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400' },
    stock_take_out:  { label: 'ST−', cls: 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400' },
    production_in:   { label: 'MFG+', cls: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400' },
    production_out:  { label: 'MFG−', cls: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400' },
    sales_return_in: { label: 'RET', cls: 'bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-400' },
  };
  const cfg = map[type] ?? {
    label: type.toUpperCase(),
    cls: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400',
  };
  return (
    <span className={`mt-0.5 inline-flex h-9 w-12 shrink-0 items-center justify-center rounded-md text-[10px] font-bold tracking-wide ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const diffH = (Date.now() - d.getTime()) / 3_600_000;
  if (diffH < 1) return `${Math.max(1, Math.round(diffH * 60))}m ago`;
  if (diffH < 24) return `${Math.round(diffH)}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}
