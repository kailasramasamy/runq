import { Fragment } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Boxes, Search } from 'lucide-react';
import {
  PageHeader, Input, Combobox, Table, TableHeader, TableBody, TableRow, TableCell, Th,
  TableSkeleton, EmptyState,
} from '@/components/ui';
import { useOnHand, useWarehouses } from '@/hooks/queries/use-inventory';
import { InvClassTabs, classGroupForItemClass, type ItemClassGroup } from '@/components/inventory/inv-class-tabs';
import { groupByItem, ItemGroupRow, StockRow } from './_on-hand-rows';

const UNCATEGORISED = 'Uncategorised';

/**
 * Split category-tagged rows into sections, in the order the server sent them:
 * the sequence set on the categories master, with uncategorised last.
 *
 * Insertion order into the Map *is* that order, which is the whole point — the
 * alphabetical re-sort that used to live on this screen threw the configured
 * sequence away. The heading is the category group (the parent), falling back
 * to the leaf for an item filed straight onto a root category.
 */
function groupByCategory<T extends { categoryName: string | null; categoryGroup: string | null }>(
  rows: T[],
) {
  const byCategory = new Map<string, T[]>();
  for (const r of rows) {
    const key = (r.categoryGroup ?? r.categoryName ?? '').trim() || UNCATEGORISED;
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key)!.push(r);
  }
  return [...byCategory].map(([label, sectionRows]) => ({ key: label, label, rows: sectionRows }));
}

type Params = {
  q?: string; warehouseId?: string; lowOnly?: string; classGroup?: string; view?: string;
};

/** Item totals are the default: stock arrives batch-per-receipt, so the raw
 *  list runs to hundreds of rows for a handful of real items and a planner
 *  sizing a work order only wants the total. Batches stay one click away. */
type StockView = 'item' | 'batch';

/** Strict parse — only one of the 5 valid bucket names round-trips. An
 *  absent or invalid param yields null so the screen knows to compute
 *  a fall-through default once counts are available. */
function parseGroup(v: string | undefined): ItemClassGroup | null {
  return v === 'finished' || v === 'inputs' || v === 'trading' || v === 'other' || v === 'all'
    ? v
    : null;
}

export function OnHandPage() {
  const navigate = useNavigate();
  const params = useSearch({ strict: false }) as Params;
  const search = params.q ?? '';
  const warehouseId = params.warehouseId ?? '';
  const lowOnly = params.lowOnly === 'true';
  const urlGroup = parseGroup(params.classGroup);
  const view: StockView = params.view === 'batch' ? 'batch' : 'item';

  function updateSearch(patch: Partial<Params>) {
    navigate({
      to: '/inventory/stock/on-hand',
      search: (prev: Params) => {
        const next = { ...prev, ...patch };
        for (const k of Object.keys(next) as (keyof Params)[]) {
          if (next[k] === '' || next[k] === undefined) delete next[k];
        }
        return next;
      },
      replace: true,
    } as never);
  }

  const { data: warehouses } = useWarehouses();
  const { data, isLoading } = useOnHand({
    warehouseId: warehouseId || undefined,
    lowOnly: lowOnly ? true : undefined,
  });

  const allRows = data ?? [];
  // Per-bucket counts feed the tab strip. Compute from the warehouse+lowOnly
  // server result, before the local search + class filters narrow further —
  // so the tabs always reflect what's available in the current warehouse.
  const counts: Partial<Record<Exclude<ItemClassGroup, 'all'>, number>> = {};
  for (const r of allRows) {
    // classGroupForItemClass never returns 'all' — it always lands in a
    // concrete bucket — so the cast below is safe.
    const g = classGroupForItemClass(r.itemClass) as Exclude<ItemClassGroup, 'all'>;
    counts[g] = (counts[g] ?? 0) + 1;
  }
  // Opens on "All" — this page answers "what's in the godown", and hiding
  // three quarters of it behind a pill made the row count disagree with what
  // the warehouse actually holds. On 'all' the table is split into class-group
  // sections; picking a pill narrows to one bucket and renders flat.
  const classGroup: ItemClassGroup = urlGroup ?? 'all';
  const rows = allRows
    .filter((r) => {
      if (classGroup !== 'all' && classGroupForItemClass(r.itemClass) !== classGroup) return false;
      const q = search.toLowerCase();
      return !q || r.itemName.toLowerCase().includes(q) || (r.itemSku ?? '').toLowerCase().includes(q) || r.batchNo.toLowerCase().includes(q);
    });

  // Always sectioned by category now. The old class buckets collapsed to a
  // single pointless header under a class pill; categories don't — picking
  // "Inputs" still leaves several of them. Both views section on the same keys
  // and in the same server order, so the screen reads the same either way.
  const itemGroups = groupByItem(rows);
  const sections = groupByCategory(rows);
  const itemSections = groupByCategory(itemGroups);

  const whOptions = [
    { value: '', label: 'All warehouses' },
    ...(warehouses ?? []).map((w) => ({ value: w.id, label: w.name })),
  ];

  const hasFilters = !!search || !!warehouseId || lowOnly;

  return (
    <div>
      <PageHeader title="Stock on hand" description="Live quantity and value by warehouse and batch." fullWidth />

      <div className="mb-3">
        <InvClassTabs
          selected={classGroup}
          counts={counts}
          // Persist every explicit pick in the URL — that includes 'finished'
          // because once the user picks it, we want to remember their intent
          // even if the cart of items briefly empties (e.g. they changed
          // warehouse and the new one has no finished goods).
          onChange={(g) => updateSearch({ classGroup: g })}
        />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="w-72 max-w-full">
          <Input
            icon={<Search size={13} />}
            placeholder="Search item name or SKU…"
            value={search}
            onChange={(e) => updateSearch({ q: e.target.value || undefined })}
          />
        </div>
        <Combobox
          options={whOptions}
          value={warehouseId}
          onChange={(v) => updateSearch({ warehouseId: v || undefined })}
          placeholder="All warehouses"
          inputClassName="h-8 py-0 text-[12.5px]"
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={lowOnly}
            onChange={(e) => updateSearch({ lowOnly: e.target.checked ? 'true' : undefined })}
          />
          Below reorder level only
        </label>
        <div className="flex-1" />
        <ViewToggle value={view} onChange={(v) => updateSearch({ view: v === 'item' ? undefined : v })} />
        <span className="num text-[12px]" style={{ color: 'var(--text-3)' }}>
          {view === 'item'
            ? `${itemGroups.length} ${itemGroups.length === 1 ? 'item' : 'items'} · ${rows.length} batches`
            : `${rows.length} rows`}
        </span>
      </div>

      {isLoading ? (
        <TableSkeleton rows={6} cols={7} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title={hasFilters ? 'No stock matches your filters' : 'No stock yet'}
          description={hasFilters ? 'Try adjusting your search or filters.' : 'Post a GRN to start tracking on-hand stock.'}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <Th>Item</Th>
              <Th>SKU</Th>
              <Th>Warehouse</Th>
              <Th>{view === 'item' ? 'Batches' : 'Batch'}</Th>
              <Th>Received</Th>
              <Th>Expiry</Th>
              <Th className="text-right">Qty</Th>
              <Th className="text-right">Avg cost</Th>
              <Th className="text-right">Value</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {view === 'item'
              ? itemSections.map((s) => (
                  <Fragment key={s.key}>
                    <SectionHeaderRow
                      label={s.label}
                      count={s.rows.length}
                      value={s.rows.reduce((n, g) => n + g.value, 0)}
                    />
                    {s.rows.map((g) => <ItemGroupRow key={g.key} group={g} />)}
                  </Fragment>
                ))
              : sections.map((s) => (
                  <Fragment key={s.key}>
                    <SectionHeaderRow
                      label={s.label}
                      count={s.rows.length}
                      value={s.rows.reduce((n, r) => n + r.value, 0)}
                    />
                    {s.rows.map((r, i) => (
                      <StockRow key={`${r.itemId}-${r.warehouseId}-${r.batchNo}-${i}`} row={r} />
                    ))}
                  </Fragment>
                ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

/** Item totals vs the raw batch list. Mirrors the class-tab pill styling so the
 *  two controls on this toolbar read as one family. */
function ViewToggle({ value, onChange }: { value: StockView; onChange: (v: StockView) => void }) {
  const opts: { key: StockView; label: string }[] = [
    { key: 'item', label: 'By item' },
    { key: 'batch', label: 'By batch' },
  ];
  return (
    <div className="flex items-center gap-1.5">
      {opts.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={[
            'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
            value === o.key
              ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200'
              : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800',
          ].join(' ')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Category divider inside the table. Carries the section's own row count and
 *  value subtotal so each block states its total instead of forcing a mental
 *  tally down the column. Takes the two numbers rather than the rows, because
 *  the item and batch views hand it different row shapes. */
function SectionHeaderRow({ label, count, value }: { label: string; count: number; value: number }) {
  return (
    <TableRow className="bg-zinc-50/80 dark:bg-zinc-800/40">
      <TableCell colSpan={6} className="py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {label}
        </span>
        <span className="ml-2 text-xs text-zinc-500">
          {count} {count === 1 ? 'row' : 'rows'}
        </span>
      </TableCell>
      <TableCell colSpan={3} className="py-2 text-right tabular-nums text-xs font-semibold text-zinc-600 dark:text-zinc-300">
        ₹{value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
      </TableCell>
    </TableRow>
  );
}

