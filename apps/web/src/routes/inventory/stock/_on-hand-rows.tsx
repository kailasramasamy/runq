import { Fragment, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Badge, TableRow, TableCell } from '@/components/ui';
import type { OnHandRow } from '@/hooks/queries/use-inventory';
import { formatItemQty } from '@/lib/utils';

/**
 * One line per item+warehouse, with its batches folded underneath.
 *
 * Stock arrives batch-per-receipt, so a plant taking milk twice a day
 * accumulates hundreds of rows for what a planner thinks of as three
 * numbers. Manufacturing needs the total per item to size a work order;
 * the batches still matter for FEFO and traceability, so they stay one
 * click away rather than being dropped.
 */
export interface ItemGroup {
  key: string;
  itemName: string;
  itemSku: string | null;
  itemUnit: string | null;
  itemClass: string | null;
  warehouseName: string;
  qty: number;
  value: number;
  /** Weighted average across the batches — value/qty, not a mean of costs. */
  avgCost: number;
  reorderLevel: number | null;
  earliestExpiry: string | null;
  batches: OnHandRow[];
}

export function groupByItem(rows: OnHandRow[]): ItemGroup[] {
  const map = new Map<string, ItemGroup>();
  for (const r of rows) {
    const key = `${r.itemId}|${r.warehouseId}`;
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        itemName: r.itemName,
        itemSku: r.itemSku,
        itemUnit: r.itemUnit,
        itemClass: r.itemClass,
        warehouseName: r.warehouseName,
        qty: 0,
        value: 0,
        avgCost: 0,
        reorderLevel: r.reorderLevel,
        earliestExpiry: null,
        batches: [],
      };
      map.set(key, g);
    }
    g.qty += r.qty;
    g.value += r.value;
    g.batches.push(r);
    if (r.expiryDate && (g.earliestExpiry == null || r.expiryDate < g.earliestExpiry)) {
      g.earliestExpiry = r.expiryDate;
    }
  }
  for (const g of map.values()) {
    g.avgCost = g.qty === 0 ? 0 : g.value / g.qty;
    // Oldest batch first so the fold reads FEFO top-down.
    g.batches.sort((a, b) => (a.receivedAt ?? '').localeCompare(b.receivedAt ?? ''));
  }
  return [...map.values()].sort((a, b) => a.itemName.localeCompare(b.itemName));
}

/** Quantities read the way their item is measured — see formatItemQty. */
const qtyFmt = (n: number, itemClass?: string | null, unit?: string | null) =>
  formatItemQty(n, itemClass, unit);
const moneyFmt = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export function ItemGroupRow({ group: g }: { group: ItemGroup }) {
  const [open, setOpen] = useState(false);
  const low = g.reorderLevel != null && g.qty <= g.reorderLevel;
  return (
    <Fragment>
      <TableRow
        className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
        onClick={() => setOpen((v) => !v)}
      >
        <TableCell>
          <div className="flex items-baseline gap-2">
            <ChevronRight
              size={13}
              className={`shrink-0 self-center text-zinc-400 transition-transform ${open ? 'rotate-90' : ''}`}
            />
            <span className="font-medium">{g.itemName}</span>
            {g.itemUnit && <span className="text-xs text-zinc-500 dark:text-zinc-400">{g.itemUnit}</span>}
          </div>
          {low && <Badge variant="warning" className="mt-1">Low stock</Badge>}
        </TableCell>
        <TableCell className="font-mono text-xs">{g.itemSku ?? '—'}</TableCell>
        <TableCell>{g.warehouseName}</TableCell>
        <TableCell className="text-xs text-zinc-500">
          {g.batches.length} {g.batches.length === 1 ? 'batch' : 'batches'}
        </TableCell>
        <TableCell className="text-xs text-zinc-400">—</TableCell>
        <TableCell><ExpiryCell date={g.earliestExpiry} /></TableCell>
        <TableCell className="text-right font-semibold tabular-nums">{qtyFmt(g.qty, g.itemClass, g.itemUnit)}</TableCell>
        <TableCell className="text-right tabular-nums">{moneyFmt(g.avgCost)}</TableCell>
        <TableCell className="text-right font-semibold tabular-nums">{moneyFmt(g.value)}</TableCell>
      </TableRow>
      {open && g.batches.map((r, i) => (
        <StockRow key={`${r.itemId}-${r.warehouseId}-${r.batchNo}-${i}`} row={r} nested />
      ))}
    </Fragment>
  );
}

/** Stock left over from an earlier intake — yesterday's balance rather than a
 *  full can. Only knowable once the origin says how much went in. */
function isPartUsed(r: OnHandRow): boolean {
  return r.receivedQty != null && r.qty < r.receivedQty - 0.0005;
}

export function StockRow({ row: r, nested }: { row: OnHandRow; nested?: boolean }) {
  return (
    <TableRow className={nested ? 'bg-zinc-50/60 dark:bg-zinc-900/40' : undefined}>
      <TableCell className={nested ? 'pl-8' : undefined}>
        {nested ? (
          // The item name is the group heading directly above, so the nested
          // row spends this cell on the one thing the batch number cannot
          // say: which collection, shift and centre it came from.
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-zinc-700 dark:text-zinc-300">
              {r.originLabel ?? r.itemName}
            </span>
            {r.originDetail && (
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{r.originDetail}</span>
            )}
            {r.addedQty != null && r.addedQty > 0.0005 && (
              <span className="text-[11px] text-amber-700 dark:text-amber-500">
                +{formatItemQty(r.addedQty, r.itemClass, r.itemUnit)} added separately
              </span>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <span className="font-medium">{r.itemName}</span>
              {r.itemUnit && <span className="text-xs text-zinc-500 dark:text-zinc-400">{r.itemUnit}</span>}
            </div>
            {r.reorderLevel != null && r.qty <= r.reorderLevel && (
              <Badge variant="warning" className="mt-1">Low stock</Badge>
            )}
          </>
        )}
      </TableCell>
      <TableCell className="font-mono text-xs">{r.itemSku ?? '—'}</TableCell>
      <TableCell>{r.warehouseName}</TableCell>
      <TableCell className="font-mono text-xs">
        {r.batchNo || '—'}
        {isPartUsed(r) && (
          <span className="ml-1 font-sans text-[11px] text-zinc-500 dark:text-zinc-400">
            part-used
          </span>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap text-xs">{formatReceivedAt(r.receivedAt)}</TableCell>
      <TableCell><ExpiryCell date={r.expiryDate} /></TableCell>
      <TableCell className="text-right tabular-nums">{qtyFmt(r.qty, r.itemClass, r.itemUnit)}</TableCell>
      <TableCell className="text-right tabular-nums">{moneyFmt(r.avgCost)}</TableCell>
      <TableCell className="text-right tabular-nums font-medium">{moneyFmt(r.value)}</TableCell>
    </TableRow>
  );
}

/** Per-row expiry indicator. Shows nothing for batches without a tracked
 *  date (most non-perishable stock), a coloured badge for batches inside
 *  the 2-day urgency window, and a plain date otherwise. */
export function ExpiryCell({ date }: { date: string | null }) {
  if (!date) return <span className="text-zinc-400">—</span>;
  const days = daysFromToday(date);
  if (days == null) return <span className="text-xs text-zinc-500">{date}</span>;
  if (days < 0) return <Badge variant="danger">Expired · {date}</Badge>;
  if (days === 0) return <Badge variant="danger">Today · {date}</Badge>;
  if (days === 1) return <Badge variant="warning">Tomorrow · {date}</Badge>;
  if (days <= 7) return <Badge variant="warning">{days}d · {date}</Badge>;
  return <span className="text-xs text-zinc-500">{date}</span>;
}

function daysFromToday(iso: string): number | null {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

/** Batch intake stamp: date plus clock time, since several tankers can land on
 *  the same day and the order they arrived is what matters for short-life stock. */
function formatReceivedAt(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
  });
}
