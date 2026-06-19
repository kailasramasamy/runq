import { Plus, Trash2 } from 'lucide-react';
import { Button, Input, Combobox } from '@/components/ui';
import type { CattleBreed, CattleBreedCount } from '@/hooks/queries/use-milk-procurement';

const BREED_OPTIONS: { value: CattleBreed; label: string }[] = [
  { value: 'desi_natti', label: 'Desi Natti' },
  { value: 'crossbred', label: 'Crossbred' },
  { value: 'jersey', label: 'Jersey' },
  { value: 'hf', label: 'HF (Holstein Friesian)' },
  { value: 'gir', label: 'Gir' },
  { value: 'sahiwal', label: 'Sahiwal' },
  { value: 'murrah', label: 'Murrah (Buffalo)' },
  { value: 'other', label: 'Other' },
];

interface BreedCountEditorProps {
  value: CattleBreedCount[];
  onChange: (rows: CattleBreedCount[]) => void;
}

export function BreedCountEditor({ value, onChange }: BreedCountEditorProps) {
  const total = value.reduce((s, r) => s + (r.count || 0), 0);

  function addRow() {
    onChange([...value, { breed: 'desi_natti', count: 1 }]);
  }

  function removeRow(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }

  function updateRow(i: number, patch: Partial<CattleBreedCount>) {
    onChange(value.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Cattle breeds
          {total > 0 && (
            <span className="ml-2 text-xs text-zinc-400">Total: {total} head</span>
          )}
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={addRow}>
          <Plus className="h-3 w-3" /> Add breed
        </Button>
      </div>

      {value.length === 0 && (
        <p className="text-xs text-zinc-400 dark:text-zinc-500">No breeds added. Click "Add breed" to record herd composition.</p>
      )}

      {value.map((row, i) => (
        <div key={i} className="flex items-end gap-2">
          <div className="flex-1">
            <Combobox
              value={row.breed}
              onChange={(v) => updateRow(i, { breed: v as CattleBreed })}
              options={BREED_OPTIONS}
              placeholder="Select breed"
            />
          </div>
          <div className="w-24">
            <Input
              type="number"
              min={1}
              value={row.count}
              onChange={(e) => updateRow(i, { count: Math.max(1, parseInt(e.target.value) || 1) })}
              placeholder="Count"
            />
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => removeRow(i)} className="shrink-0 text-red-500 hover:text-red-600">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}
