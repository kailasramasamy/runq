// Inventory class-group tab strip (web).
//
// Mirror of apps/mobile/lib/screens/inventory/widgets/inv_class_tabs.dart —
// collapses the 7 item_class enum values into 4 operational buckets so
// stock screens segregate manufactured goods from raw materials, packaging,
// trading goods, and spares.
//
// Used by every inventory screen that lists or picks items: On-hand,
// Adjustments, Stock-take, GRN, Dispatch, Transfer. Each screen passes
// its per-screen default (e.g. Dispatch → Finished, GRN → Inputs) and
// supplies a per-bucket count so the strip can hide empty buckets and
// show quick counts.

export type ItemClassGroup = 'all' | 'finished' | 'inputs' | 'trading' | 'other';

/** Fall-through order used when a screen's preferred default bucket is
 *  empty. Manufactured first, then trading, inputs, other — keeps the
 *  user on a "things to sell" view whenever possible. */
const FALLBACK_ORDER: Exclude<ItemClassGroup, 'all'>[] = ['finished', 'trading', 'inputs', 'other'];

/** Resolves the bucket a screen should land on given its preferred
 *  default and the current per-bucket counts. Server-paginated screens
 *  that don't have counts handy can call without the second arg — they
 *  get the preferred default back untouched. */
export function resolveDefaultClassGroup(
  preferred: ItemClassGroup,
  counts?: Partial<Record<Exclude<ItemClassGroup, 'all'>, number>>,
): ItemClassGroup {
  if (preferred === 'all') return 'all';
  if (!counts) return preferred;
  if ((counts[preferred] ?? 0) > 0) return preferred;
  for (const g of FALLBACK_ORDER) {
    if ((counts[g] ?? 0) > 0) return g;
  }
  return 'all';
}

/** item_class → bucket. Mirrors ITEM_CLASS_GROUP_MEMBERS on the server. */
export function classGroupForItemClass(itemClass: string | null | undefined): ItemClassGroup {
  switch (itemClass) {
    case 'finished_good':
    case 'semi_finished':
      return 'finished';
    case 'raw_material':
    case 'packaging':
      return 'inputs';
    case 'trading_good':
      return 'trading';
    case 'consumable':
    case 'spare_part':
      return 'other';
    default:
      return 'other';
  }
}

const BUCKETS: { key: Exclude<ItemClassGroup, 'all'>; label: string }[] = [
  { key: 'finished', label: 'Finished' },
  { key: 'inputs',   label: 'Inputs' },
  { key: 'trading',  label: 'Trading' },
  { key: 'other',    label: 'Other' },
];

/** Second-level pills, shown under a bucket that mixes jobs. Inputs is the
 *  one that bites: raw material and packaging are stored, counted and
 *  reordered by different people, so a mixed list forces a search. Only
 *  rendered when the screen opts in by passing `itemClass`/`onItemClassChange`. */
const SUBCLASSES: Partial<Record<ItemClassGroup, { key: string; label: string }[]>> = {
  inputs: [
    { key: 'raw_material', label: 'Raw material' },
    { key: 'packaging', label: 'Packaging' },
  ],
  finished: [
    { key: 'finished_good', label: 'Packed' },
    { key: 'semi_finished', label: 'Unlabelled' },
  ],
  other: [
    { key: 'consumable', label: 'Consumable' },
    { key: 'spare_part', label: 'Spare part' },
  ],
};

interface Props {
  selected: ItemClassGroup;
  /** Per-bucket counts. Omit when the screen is server-paginated and counts
   *  aren't free to compute — all 4 buckets render and counts are hidden. */
  counts?: Partial<Record<Exclude<ItemClassGroup, 'all'>, number>>;
  onChange: (group: ItemClassGroup) => void;
  /** Active second-level item_class within the selected bucket, null = whole
   *  bucket. Omit both this and `onItemClassChange` to hide the sub-row. */
  itemClass?: string | null;
  onItemClassChange?: (itemClass: string | null) => void;
  /** Per-item_class tallies for the second-level pills. Omit to hide those
   *  counts — the bucket totals can't be split any finer. */
  classCounts?: Partial<Record<string, number>>;
}

export function InvClassTabs({
  selected, counts, onChange, itemClass, onItemClassChange, classCounts,
}: Props) {
  // When counts are supplied: hide empty buckets so a pure-trading shop
  // doesn't see dead Finished/Inputs/Other pills. When omitted (server-
  // paginated screens), render all 4 and skip the count badge.
  const hasCounts = counts != null;
  const visible = hasCounts ? BUCKETS.filter((b) => (counts[b.key] ?? 0) > 0) : BUCKETS;
  const total = hasCounts ? visible.reduce((sum, b) => sum + (counts[b.key] ?? 0), 0) : 0;
  const subclasses = onItemClassChange ? (SUBCLASSES[selected] ?? []) : [];

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Pill label="All" count={total} showCount={false}
        active={selected === 'all'} onClick={() => onChange('all')} />
      {visible.map((b) => (
        <Pill
          key={b.key}
          label={b.label}
          count={counts?.[b.key] ?? 0}
          showCount={hasCounts}
          active={selected === b.key}
          onClick={() => onChange(b.key)}
        />
      ))}
      {subclasses.length > 0 && (
        <div className="flex w-full flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>Type</span>
          <Pill
            label="All"
            count={selected === 'all' ? 0 : (counts?.[selected] ?? 0)}
            showCount={hasCounts}
            active={!itemClass}
            onClick={() => onItemClassChange!(null)}
          />
          {subclasses.map((c) => (
            <Pill
              key={c.key}
              label={c.label}
              count={classCounts?.[c.key] ?? 0}
              showCount={classCounts != null}
              active={itemClass === c.key}
              onClick={() => onItemClassChange!(c.key)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Pill({
  label, count, showCount, active, onClick,
}: { label: string; count: number; showCount: boolean; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200'
          : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800',
      ].join(' ')}
    >
      <span>{label}</span>
      {showCount && (
        <span className={active ? 'tabular-nums text-amber-700 dark:text-amber-300' : 'tabular-nums text-zinc-400'}>
          {count}
        </span>
      )}
    </button>
  );
}
