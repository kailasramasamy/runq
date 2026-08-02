// Class-group sectioning for the items list.
//
// When no single bucket is selected the list interleaves finished goods with
// the raw material they're made from, which reads as noise. These helpers
// split the rows into labelled sections in the same order as the class-tab
// strip. The server orders items by the matching class rank, so sections stay
// contiguous across page boundaries.

import { classGroupForItemClass } from './inv-class-tabs';

/** Minimal shape needed to bucket a row — anything item-like satisfies it. */
export interface ClassifiableItem {
  itemClass?: string | null;
  type?: string;
}

const SECTION_ORDER: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'finished', label: 'Finished goods' },
  { key: 'inputs', label: 'Raw materials & inputs' },
  { key: 'trading', label: 'Trading goods' },
  { key: 'other', label: 'Consumables & spares' },
  { key: 'services', label: 'Services' },
];

/** Services get their own bucket rather than falling into "Consumables &
 *  spares", which they are not. */
function sectionKey(item: ClassifiableItem): string {
  return item.type === 'service' ? 'services' : classGroupForItemClass(item.itemClass);
}

/** Split rows into sections, dropping empty buckets so a catalogue of only
 *  finished goods shows one header rather than five. */
export function groupItemsByClass<T extends ClassifiableItem>(rows: T[]) {
  return SECTION_ORDER.map((s) => ({
    ...s,
    rows: rows.filter((r) => sectionKey(r) === s.key),
  })).filter((s) => s.rows.length > 0);
}

/** Class-group divider inside the items table. */
export function ItemSectionRow({
  label, count, colSpan,
}: { label: string; count: number; colSpan: number }) {
  return (
    <tr className="bg-zinc-50/80 dark:bg-zinc-800/40">
      <td colSpan={colSpan} className="px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {label}
        </span>
        <span className="ml-2 text-xs text-zinc-500">
          {count} {count === 1 ? 'item' : 'items'}
        </span>
      </td>
    </tr>
  );
}
