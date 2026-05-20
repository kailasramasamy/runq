import { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { Modal, Button, Textarea, useToast } from '@/components/ui';

export interface AiSuggestItem {
  name: string;
  rationale: string;
}

interface DescribeStepProps {
  placeholder: string;
  busy: boolean;
  value: string;
  onChange: (v: string) => void;
  onCancel: () => void;
  onSuggest: () => void;
}

function DescribeStep({ placeholder, busy, value, onChange, onCancel, onSuggest }: DescribeStepProps) {
  return (
    <div className="space-y-3">
      <Textarea
        label="Describe the business"
        helper="Industry, what it makes or does, rough headcount. The more specific, the better."
        rows={4}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus
      />
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="button" onClick={onSuggest} disabled={busy}>
          {busy
            ? <><Loader2 size={13} className="animate-spin" /> Thinking…</>
            : <><Sparkles size={13} /> Suggest</>}
        </Button>
      </div>
    </div>
  );
}

interface ResultsStepProps<T extends AiSuggestItem> {
  noun: string;
  suggestions: T[];
  selected: Set<number>;
  renderMeta?: (item: T) => string | null;
  busy: boolean;
  onToggle: (i: number) => void;
  onReset: () => void;
  onCancel: () => void;
  onSeed: () => void;
}

function ResultsStep<T extends AiSuggestItem>({
  noun, suggestions, selected, renderMeta, busy, onToggle, onReset, onCancel, onSeed,
}: ResultsStepProps<T>) {
  return (
    <div className="space-y-3">
      <p className="text-[12px]" style={{ color: 'var(--text-3)' }}>
        {selected.size} of {suggestions.length} selected. Untick anything you don’t need.
      </p>
      <div className="space-y-1.5 max-h-[360px] overflow-y-auto">
        {suggestions.map((s, i) => {
          const meta = renderMeta?.(s) ?? null;
          return (
            <label
              key={i}
              className="flex items-start gap-2.5 rounded-md border p-2.5 cursor-pointer"
              style={{ borderColor: 'var(--border)' }}
            >
              <input
                type="checkbox"
                checked={selected.has(i)}
                onChange={() => onToggle(i)}
                className="mt-0.5 accent-[var(--accent)]"
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-medium" style={{ color: 'var(--text-1)' }}>{s.name}</span>
                  {meta && (
                    <span
                      className="rounded px-1.5 py-0.5 text-[11px]"
                      style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}
                    >
                      {meta}
                    </span>
                  )}
                </div>
                {s.rationale && (
                  <p className="mt-0.5 text-[12px]" style={{ color: 'var(--text-3)' }}>{s.rationale}</p>
                )}
              </div>
            </label>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="outline" onClick={onReset}>Start over</Button>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button type="button" onClick={onSeed} disabled={busy || selected.size === 0}>
            {busy ? 'Adding…' : `Add ${selected.size} ${noun}${selected.size === 1 ? '' : 's'}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface HrAiSuggestDialogProps<T extends AiSuggestItem> {
  open: boolean;
  onClose: () => void;
  title: string;
  noun: string;
  placeholder: string;
  suggest: (description: string) => Promise<T[]>;
  seed: (selected: T[]) => Promise<{ createdCount: number; skipped: string[] }>;
  renderMeta?: (item: T) => string | null;
  isSuggesting: boolean;
  isSeeding: boolean;
}

export function HrAiSuggestDialog<T extends AiSuggestItem>({
  open, onClose, title, noun, placeholder,
  suggest, seed, renderMeta, isSuggesting, isSeeding,
}: HrAiSuggestDialogProps<T>) {
  const { toast } = useToast();
  const [description, setDescription] = useState('');
  const [suggestions, setSuggestions] = useState<T[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  function reset() {
    setDescription('');
    setSuggestions(null);
    setSelected(new Set());
  }
  function close() {
    reset();
    onClose();
  }

  async function handleSuggest() {
    if (description.trim().length < 10) {
      toast('Describe the business in a sentence or two first.', 'error');
      return;
    }
    try {
      const items = await suggest(description.trim());
      if (!items.length) {
        toast('No suggestions came back — try rephrasing the description.', 'error');
        return;
      }
      setSuggestions(items);
      setSelected(new Set(items.map((_, i) => i)));
    } catch (err: any) {
      toast(err?.message ?? 'Could not get suggestions', 'error');
    }
  }

  async function handleSeed() {
    if (!suggestions) return;
    const picked = suggestions.filter((_, i) => selected.has(i));
    if (!picked.length) {
      toast(`Select at least one ${noun}.`, 'error');
      return;
    }
    try {
      const res = await seed(picked);
      toast(
        res.skipped.length
          ? `Added ${res.createdCount}, skipped ${res.skipped.length} (already exist)`
          : `Added ${res.createdCount} ${noun}${res.createdCount === 1 ? '' : 's'}`,
        'success',
      );
      close();
    } catch (err: any) {
      toast(err?.message ?? 'Could not add', 'error');
    }
  }

  function toggle(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  if (!open) return null;

  return (
    <Modal open onClose={close} title={title}>
      {suggestions ? (
        <ResultsStep
          noun={noun}
          suggestions={suggestions}
          selected={selected}
          renderMeta={renderMeta}
          busy={isSeeding}
          onToggle={toggle}
          onReset={reset}
          onCancel={close}
          onSeed={handleSeed}
        />
      ) : (
        <DescribeStep
          placeholder={placeholder}
          busy={isSuggesting}
          value={description}
          onChange={setDescription}
          onCancel={close}
          onSuggest={handleSuggest}
        />
      )}
    </Modal>
  );
}
