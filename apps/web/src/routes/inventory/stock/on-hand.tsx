import { useNavigate, useSearch } from '@tanstack/react-router';
import { Boxes, Search } from 'lucide-react';
import {
  PageHeader, Input, Combobox, Table, TableHeader, TableBody, TableRow, TableCell, Th,
  TableSkeleton, EmptyState, Badge,
} from '@/components/ui';
import { useOnHand, useWarehouses } from '@/hooks/queries/use-inventory';
import { InvClassTabs, classGroupForItemClass, resolveDefaultClassGroup, type ItemClassGroup } from '@/components/inventory/inv-class-tabs';

type Params = { q?: string; warehouseId?: string; lowOnly?: string; classGroup?: string };

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
  // No URL choice → compute fall-through default from counts. Preferred
  // = Finished, falls through to Trading / Inputs / Other / All if empty.
  // Once the user clicks a pill it lands in the URL and overrides this.
  const classGroup: ItemClassGroup = urlGroup ?? resolveDefaultClassGroup('finished', counts);
  const rows = allRows.filter((r) => {
    if (classGroup !== 'all' && classGroupForItemClass(r.itemClass) !== classGroup) return false;
    const q = search.toLowerCase();
    return !q || r.itemName.toLowerCase().includes(q) || (r.itemSku ?? '').toLowerCase().includes(q) || r.batchNo.toLowerCase().includes(q);
  });

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
        <span className="num text-[12px]" style={{ color: 'var(--text-3)' }}>{rows.length} rows</span>
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
              <Th>Batch</Th>
              <Th className="text-right">Qty</Th>
              <Th className="text-right">Avg cost</Th>
              <Th className="text-right">Value</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={`${r.itemId}-${r.warehouseId}-${r.batchNo}-${i}`}>
                <TableCell>
                  <div className="flex items-baseline gap-2">
                    <span className="font-medium">{r.itemName}</span>
                    {r.itemUnit && (
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">{r.itemUnit}</span>
                    )}
                  </div>
                  {r.reorderLevel != null && r.qty <= r.reorderLevel && (
                    <Badge variant="warning" className="mt-1">Low stock</Badge>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs">{r.itemSku ?? '—'}</TableCell>
                <TableCell>{r.warehouseName}</TableCell>
                <TableCell className="font-mono text-xs">{r.batchNo || '—'}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.qty.toLocaleString('en-IN', { maximumFractionDigits: 3 })}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  ₹{r.avgCost.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
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
