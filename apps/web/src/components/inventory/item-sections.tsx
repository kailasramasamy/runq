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

/** Class-group divider inside the items table. `level` 2 is the nested
 *  subcategory header — indented and lighter so the category above it still
 *  reads as the parent. */
export function ItemSectionRow({
  label, count, colSpan, level = 1,
}: { label: string; count: number; colSpan: number; level?: 1 | 2 }) {
  const nested = level === 2;
  return (
    <tr className={nested ? 'bg-zinc-50/40 dark:bg-zinc-800/20' : 'bg-zinc-50/80 dark:bg-zinc-800/40'}>
      <td colSpan={colSpan} className={nested ? 'py-1.5 pl-7 pr-3' : 'px-3 py-2'}>
        <span
          className={
            nested
              ? 'text-[10.5px] font-medium tracking-wide text-zinc-400 dark:text-zinc-500'
              : 'text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400'
          }
        >
          {label}
        </span>
        <span className="ml-2 text-xs text-zinc-500">
          {count} {count === 1 ? 'item' : 'items'}
        </span>
      </td>
    </tr>
  );
}

/** Minimal shape needed to bucket a row by its category tree position. */
export interface CategorisedItem {
  category?: string | null;
  subcategory?: string | null;
}

const UNCATEGORISED = 'Uncategorised';

/**
 * Split rows into category sections, each holding its subcategory sub-sections.
 * Rows filed directly on a root category (no subcategory) sit in a nameless
 * first sub-section so they render straight under the category header. The
 * server orders by the same category → subcategory keys, so a section never
 * straddles a page break.
 */
export function groupItemsByCategory<T extends CategorisedItem>(rows: T[]) {
  const byCategory = new Map<string, Map<string, T[]>>();
  for (const row of rows) {
    const cat = row.category?.trim() || UNCATEGORISED;
    const sub = row.subcategory?.trim() || '';
    if (!byCategory.has(cat)) byCategory.set(cat, new Map());
    const subs = byCategory.get(cat)!;
    if (!subs.has(sub)) subs.set(sub, []);
    subs.get(sub)!.push(row);
  }
  return [...byCategory].map(([label, subs]) => ({
    label,
    count: [...subs.values()].reduce((n, r) => n + r.length, 0),
    subsections: [...subs].map(([subLabel, subRows]) => ({ label: subLabel, rows: subRows })),
  }));
}
