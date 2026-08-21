import { useEffect, useRef } from 'react';
import { Input } from '@/components/ui';
import { useOpenBatches, type OpenBatchRow } from '@/hooks/queries/use-open-batches';

/**
 * Direct-Receipt batch field. Shows open batches as one-tap chips so plant
 * staff can pool a fresh receipt into an existing batch (e.g. evening + next
 * morning milk both into A1-POOL-20260531) without retyping the code, plus
 * a suggested code for starting a brand-new batch — the item's
 * batch_code_template when it has one, else the house `<SKU>-<YYDDD>`
 * convention. That suggestion seeds the empty field so a fresh batch needs
 * no typing.
 *
 * Free text remains available — chips fill the input, they don't lock it.
 */
interface Props {
  itemId: string;
  warehouseId: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  itemName?: string;
}

export function BatchPicker({ itemId, warehouseId, value, onChange, required, itemName }: Props) {
  const ready = !!(itemId && warehouseId);
  const { data, isLoading } = useOpenBatches(itemId, warehouseId);
  const open = data?.open ?? [];
  const suggested = data?.suggested ?? null;
  const showSuggested = !!suggested && suggested !== value;

  // Seed the empty field with the suggestion rather than making the operator
  // invent a code. Only while untouched — anything typed, or carried in from
  // an edit, wins. Open batches are never seeded: pooling into existing stock
  // is a deliberate choice, not a default.
  const seededFor = useRef<string | null>(null);
  useEffect(() => {
    if (!required || !suggested || !ready) return;
    if (seededFor.current === itemId) return;
    seededFor.current = itemId;
    if (!value.trim()) onChange(suggested);
  }, [required, suggested, ready, itemId, value, onChange]);

  return (
    <div className="space-y-1.5">
      {ready && !isLoading && (open.length > 0 || showSuggested) && (
        <div className="flex flex-wrap gap-1.5">
          {open.map((b) => (
            <Chip
              key={b.batchNo}
              active={value === b.batchNo}
              onClick={() => onChange(b.batchNo)}
              label={`${b.batchNo} · ${formatQty(b.onHandQty)}${b.expiryDate ? ` · exp ${b.expiryDate}` : ''}`}
            />
          ))}
          {showSuggested && (
            <Chip
              active={false}
              onClick={() => onChange(suggested!)}
              label={`+ New: ${suggested}`}
              tone="suggest"
            />
          )}
        </div>
      )}
      <Input
        label="Batch"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={
          required
            ? `Required — ${itemName ?? 'item'} is batch-tracked`
            : 'Optional'
        }
        required={required}
        helper={
          ready && !isLoading && open.length === 0 && !showSuggested
            ? 'No open batches for this item × warehouse yet — type a fresh code.'
            : undefined
        }
      />
    </div>
  );
}

function Chip({ label, active, onClick, tone }: {
  label: string;
  active: boolean;
  onClick: () => void;
  tone?: 'suggest';
}) {
  const base = 'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer border';
  const palette = active
    ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-text)]'
    : tone === 'suggest'
      ? 'border-dashed border-zinc-400 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800'
      : 'border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800';
  return (
    <button type="button" onClick={onClick} className={`${base} ${palette}`}>
      {label}
    </button>
  );
}

function formatQty(n: number): string {
  // Trim trailing zeros: 250.000 → "250", 12.500 → "12.5".
  return Number.isInteger(n) ? String(n) : String(parseFloat(n.toFixed(3)));
}
