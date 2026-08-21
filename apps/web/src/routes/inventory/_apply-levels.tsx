/**
 * "Apply suggested levels" — bulk-writes the computed reorder points onto
 * the item master.
 *
 * Typing a threshold per SKU is why thresholds stay unset, and an item with
 * no threshold can never raise a low-stock alert. This turns the whole
 * suggestion table into one action.
 *
 * Always previews first (a server dry run), because the write touches the
 * item master across the catalogue and the counts are the only way to see
 * what it is about to do.
 */
import { useCallback, useEffect, useState } from 'react';
import { Wand2 } from 'lucide-react';
import { Button, Modal } from '@/components/ui';
import {
  useApplyReplenishment,
  type ApplyReplenishmentResult,
  type ApplyReplenishmentVars,
} from '@/hooks/queries/use-inventory';

type Filter = { window?: number; warehouseId?: string; serviceLevel?: number };

export function ApplyLevelsButton({
  filter, unconfiguredCount, totalRows,
}: {
  filter: Filter;
  unconfiguredCount: number;
  totalRows: number;
}) {
  const [open, setOpen] = useState(false);
  if (totalRows === 0) return null;
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Wand2 size={13} className="mr-1.5" />
        Apply suggested levels
      </Button>
      {open && (
        <ApplyLevelsModal
          filter={filter}
          unconfiguredCount={unconfiguredCount}
          totalRows={totalRows}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function ApplyLevelsModal({
  filter, unconfiguredCount, totalRows, onClose,
}: {
  filter: Filter;
  unconfiguredCount: number;
  totalRows: number;
  onClose: () => void;
}) {
  // 'unconfigured' is the default because overwriting a hand-typed
  // threshold in bulk is destructive and should be asked for.
  const [mode, setMode] = useState<'unconfigured' | 'all'>('unconfigured');
  const [preview, setPreview] = useState<ApplyReplenishmentResult | null>(null);
  const [done, setDone] = useState<ApplyReplenishmentResult | null>(null);
  const apply = useApplyReplenishment();

  const vars: ApplyReplenishmentVars = { ...filter, mode };
  const { mutateAsync } = apply;

  const runPreview = useCallback(async (next: 'unconfigured' | 'all') => {
    setMode(next);
    setPreview(null);
    setPreview(await mutateAsync({ ...filter, mode: next, dryRun: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mutateAsync, filter.window, filter.warehouseId, filter.serviceLevel]);

  async function commit() {
    setDone(await mutateAsync(vars));
  }

  // Preview the default mode once on open. In an effect, not in render —
  // firing the mutation during render would re-enter on every state change.
  useEffect(() => {
    void runPreview('unconfigured');
  }, [runPreview]);

  return (
    <Modal open onClose={onClose} title="Apply suggested reorder levels" size="lg">
      {done ? (
        <Result result={done} onClose={onClose} />
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Writes the computed reorder point onto each item, so low-stock alerts
            can start firing. Levels are recomputed on the server from the current
            window and service level — not read off this page.
          </p>

          <div className="space-y-2">
            <ModeOption
              label={`Only items with no level set (${unconfiguredCount})`}
              hint="Non-destructive — leaves every hand-typed threshold alone."
              checked={mode === 'unconfigured'}
              onSelect={() => void runPreview('unconfigured')}
            />
            <ModeOption
              label={`All items with demand history (${totalRows})`}
              hint="Also overwrites thresholds someone set by hand."
              checked={mode === 'all'}
              onSelect={() => void runPreview('all')}
            />
          </div>

          {apply.isPending && !preview && (
            <p className="text-sm text-zinc-500">Calculating…</p>
          )}

          {preview && <Preview preview={preview} />}

          {apply.isError && (
            <p className="text-sm text-rose-600">
              {(apply.error as Error)?.message ?? 'Could not apply levels.'}
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button
              size="sm"
              disabled={apply.isPending || !preview || preview.items.length === 0}
              onClick={() => void commit()}
            >
              {preview && preview.items.length > 0
                ? `Apply to ${preview.items.length} item${preview.items.length === 1 ? '' : 's'}`
                : 'Apply'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function ModeOption({ label, hint, checked, onSelect }: {
  label: string; hint: string; checked: boolean; onSelect: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition"
      style={{ borderColor: checked ? 'var(--text-3)' : 'var(--border)' }}>
      <input type="radio" checked={checked} onChange={onSelect} className="mt-0.5" />
      <span>
        <span className="block text-[13px] font-medium">{label}</span>
        <span className="block text-[11.5px]" style={{ color: 'var(--text-3)' }}>{hint}</span>
      </span>
    </label>
  );
}

function Preview({ preview }: { preview: ApplyReplenishmentResult }) {
  if (preview.items.length === 0) {
    return (
      <p className="rounded-lg px-3 py-2 text-[12px]"
        style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}>
        Nothing to apply — every item in this scope already has a threshold.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3 text-[12px]">
        <Stat label="Will be set" value={preview.items.length} />
        {preview.overwritten > 0 && (
          <Stat label="Overwrite existing" value={preview.overwritten} tone="warn" />
        )}
        {preview.thinHistoryApplied > 0 && (
          <Stat label="Thin history" value={preview.thinHistoryApplied} tone="warn" />
        )}
        {preview.skippedZeroLevel > 0 && (
          <Stat label="Skipped (level 0)" value={preview.skippedZeroLevel} />
        )}
      </div>
      {preview.thinHistoryApplied > 0 && (
        <p className="text-[11.5px]" style={{ color: 'var(--text-3)' }}>
          Thin-history items use a plain half-lead-time buffer rather than a
          statistical safety stock — still better than no threshold, but worth
          reviewing later.
        </p>
      )}
      <div className="max-h-56 overflow-y-auto rounded-lg border"
        style={{ borderColor: 'var(--border)' }}>
        <table className="w-full text-[12px]">
          <tbody>
            {preview.items.map((i) => (
              <tr key={i.itemId} className="border-b last:border-0"
                style={{ borderColor: 'var(--border)' }}>
                <td className="px-2.5 py-1.5">{i.itemName}</td>
                <td className="px-2.5 py-1.5 text-right tabular-nums"
                  style={{ color: 'var(--text-3)' }}>
                  {i.previousLevel === null ? 'not set' : i.previousLevel}
                </td>
                <td className="px-2.5 py-1.5 text-right tabular-nums font-medium">
                  → {i.newLevel}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'warn' }) {
  return (
    <span className="rounded-md px-2 py-1"
      style={{
        background: tone === 'warn' ? 'rgba(250,178,25,0.14)' : 'var(--surface-2)',
        color: tone === 'warn' ? '#8a6100' : 'var(--text-2)',
      }}>
      <strong className="tabular-nums">{value}</strong> {label}
    </span>
  );
}

function Result({ result, onClose }: { result: ApplyReplenishmentResult; onClose: () => void }) {
  return (
    <div className="space-y-4">
      <p className="text-sm">
        Set a reorder level on <strong>{result.applied}</strong> item
        {result.applied === 1 ? '' : 's'}.
        {result.overwritten > 0 && ` ${result.overwritten} replaced an existing level.`}
      </p>
      <p className="text-[12px]" style={{ color: 'var(--text-3)' }}>
        Low-stock alerts pick these up immediately. Notifications for items already
        below their new level go out on the next daily sweep.
      </p>
      <div className="flex justify-end border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <Button size="sm" onClick={onClose}>Done</Button>
      </div>
    </div>
  );
}
