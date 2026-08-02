import { Combobox } from '@/components/ui';
import { milkTypeLabel, type NodeType, type MilkType } from '@/hooks/queries/use-milk-procurement';

// ── shared option lists ──────────────────────────────────────────────────────
export const NODE_TYPES = [
  { value: 'vmcc', label: 'VMCC' },
  { value: 'cc', label: 'Chilling Centre' },
  { value: 'pp', label: 'Processing Plant' },
];
export const PAYOUT_MODES = [
  { value: '', label: 'Tenant default' },
  { value: 'direct_to_farmer', label: 'Direct to farmer' },
  { value: 'via_vmcc', label: 'Via VMCC' },
];
export const COMP_TYPES = [
  { value: 'per_litre_commission', label: 'Per-litre commission' },
  { value: 'fixed_salary', label: 'Fixed salary' },
];
export const ROLES = [{ value: 'operator', label: 'Operator' }, { value: 'owner', label: 'Owner' }];
export const MEASUREMENT_MODES = [
  { value: 'analyzer', label: 'Analyzer (fat/SNF)' },
  { value: 'lactometer', label: 'Lactometer (CLR only)' },
];
export const COLLECTION_SHIFTS = [
  { value: 'both', label: 'Both shifts (AM + PM)' },
  { value: 'am', label: 'AM only' },
  { value: 'pm', label: 'PM only' },
];
export const DISPATCH_MODES = [
  { value: 'per_shift', label: 'Per shift (AM and PM separately)' },
  { value: 'day', label: 'Whole day (today AM + PM together)' },
  { value: 'overnight', label: 'Overnight pool (yesterday PM + today AM)' },
];
export const DISPATCH_MODE_HELP: Record<string, string> = {
  per_shift: 'Each shift closes and dispatches on its own, and every consignment is tagged AM or PM — '
    + 'shift-level traceability survives all the way to the plant.',
  day: "Today's AM and PM close together and leave as one untagged tanker. Needs somewhere to hold the "
    + 'morning milk until the evening run.',
  overnight: "Yesterday's evening milk is chilled and leaves with this morning's collection as one "
    + "tanker. Today's PM belongs to tomorrow's pool.",
};

// The four types operators can actually select; 'cow' is legacy-only.
export const SELECTABLE_MILK_TYPES: MilkType[] = ['cow_a1', 'cow_a2', 'buffalo', 'mixed'];

/** Per-type display + URL metadata, single source for labels and route slugs. */
export const NODE_TYPE_META: Record<NodeType, { label: string }> = {
  vmcc: { label: 'VMCC' },
  cc: { label: 'Chilling Centre' },
  pp: { label: 'Processing Plant' },
};

/** Checkbox group + default picker for VMCC milk-type configuration. */
export function VmccMilkTypeFields({
  allowed, defaultType, onAllowedChange, onDefaultChange,
}: {
  allowed: MilkType[]; defaultType: string;
  onAllowedChange: (v: MilkType[]) => void; onDefaultChange: (v: string) => void;
}) {
  const toggle = (t: MilkType) => {
    const next = allowed.includes(t) ? allowed.filter((x) => x !== t) : [...allowed, t];
    onAllowedChange(next);
    // Reset default if it was just unchecked.
    if (!next.includes(defaultType as MilkType)) onDefaultChange('');
  };
  const defaultOptions = (allowed.length > 0 ? allowed : SELECTABLE_MILK_TYPES)
    .map((t) => ({ value: t, label: milkTypeLabel(t) }));

  return (
    <div className="space-y-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-700">
      <p className="text-sm font-medium">Accepted milk types</p>
      <p className="text-xs text-zinc-500">Leave all unchecked to allow all types (legacy behaviour).</p>
      <div className="grid grid-cols-2 gap-1">
        {SELECTABLE_MILK_TYPES.map((t) => (
          <label key={t} className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input type="checkbox" checked={allowed.includes(t)} onChange={() => toggle(t)} />
            {milkTypeLabel(t)}
          </label>
        ))}
      </div>
      <Combobox label="Default milk type" value={defaultType} onChange={onDefaultChange}
        options={[{ value: '', label: 'First accepted' }, ...defaultOptions]} placeholder="First accepted" />
    </div>
  );
}
