import { AlertTriangle, ArrowLeftRight, Check, X } from 'lucide-react';
import { Badge, Button, Input } from '@/components/ui';
import type { SubstituteOption } from '@/hooks/queries/use-sales-dispatch';

/**
 * "Farm Fresh Cow Milk 500ml" — a product reference that identifies the SKU.
 * One product name covers several pack sizes, and a stand-in has to say which
 * one is being offered.
 */
export function withUom(name: string, uom: string | null): string {
  return uom ? `${name} ${uom}` : name;
}

/** What the operator chose for one line, if anything. */
export interface SubstituteChoice {
  itemId: string | null;
  note: string;
}

/**
 * Sending something other than what was billed.
 *
 * The panel exists because the decision has consequences the operator can't
 * see from the shelf: a stand-in with a different HSN would misdescribe the
 * invoice for GST, and one with a different list price quietly moves margin.
 * Both are already decided server-side and arrive on each option as a
 * verdict, so this only has to show them honestly — blocked options stay
 * visible and greyed with their reason, rather than being filtered out and
 * leaving someone hunting for a SKU they can see on the rack.
 */
export function SubstitutePanel({
  billedName, substitutes, choice, onChange, onClose, confirmLabel, onConfirm, busy,
}: {
  billedName: string;
  substitutes: SubstituteOption[];
  choice: SubstituteChoice;
  onChange: (c: SubstituteChoice) => void;
  onClose: () => void;
  /** Present when the choice is saved on the spot rather than at submit. */
  confirmLabel?: string;
  onConfirm?: () => void;
  busy?: boolean;
}) {
  const chosen = substitutes.find((s) => s.itemId === choice.itemId) ?? null;
  const ready = chosen !== null
    && (chosen.verdict !== 'needs_note' || choice.note.trim().length > 0);

  return (
    <div
      className="mt-2 rounded-md border p-2.5"
      style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
    >
      <div className="mb-2 flex items-center gap-1.5">
        <ArrowLeftRight size={13} style={{ color: 'var(--text-3)' }} />
        <span className="text-[12px] font-medium">Send instead of {billedName}</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          className="rounded p-0.5 hover:opacity-70"
          aria-label="Close substitute picker"
        >
          <X size={13} style={{ color: 'var(--text-3)' }} />
        </button>
      </div>

      <div className="space-y-1">
        {substitutes.map((opt) => (
          <OptionRow
            key={opt.itemId}
            option={opt}
            selected={choice.itemId === opt.itemId}
            onSelect={() => onChange({
              itemId: choice.itemId === opt.itemId ? null : opt.itemId,
              note: '',
            })}
          />
        ))}
      </div>

      {chosen?.verdict === 'needs_note' && (
        <div className="mt-2">
          <Input
            value={choice.note}
            onChange={(e) => onChange({ ...choice, note: e.target.value })}
            placeholder="Why — e.g. Farm Fresh ran out, customer agreed"
            className="h-8 py-0 text-[12.5px]"
            autoFocus
          />
          <p className="mt-1 text-[11px]" style={{ color: 'var(--text-3)' }}>
            The customer is still billed the original price. This is recorded on
            the delivery note.
          </p>
        </div>
      )}

      {onConfirm && (
        <div className="mt-2 flex justify-end">
          <Button
            variant="primary"
            className="h-7 px-2.5 text-[12px]"
            disabled={!ready || busy}
            onClick={onConfirm}
          >
            {busy ? 'Saving…' : confirmLabel ?? 'Use substitute'}
          </Button>
        </div>
      )}
    </div>
  );
}

function OptionRow({ option, selected, onSelect }: {
  option: SubstituteOption;
  selected: boolean;
  onSelect: () => void;
}) {
  const blocked = option.verdict === 'blocked';
  return (
    <div>
      <button
        type="button"
        disabled={blocked}
        onClick={onSelect}
        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12.5px] disabled:cursor-not-allowed"
        style={{
          background: selected ? 'var(--accent-soft)' : 'transparent',
          opacity: blocked ? 0.55 : 1,
        }}
      >
        <span className="w-3.5">
          {selected && <Check size={13} style={{ color: 'var(--accent-text)' }} />}
        </span>
        <span className="flex-1">
          {withUom(option.itemName, option.uom)}
          {option.itemSku && (
            <span className="ml-1.5 text-[11px]" style={{ color: 'var(--text-3)' }}>
              {option.itemSku}
            </span>
          )}
        </span>
        <span className="num text-[11.5px]" style={{ color: 'var(--text-3)' }}>
          {option.availableQty} on hand
        </span>
        {option.verdict === 'needs_note' && <Badge variant="warning">Price differs</Badge>}
        {blocked && <Badge variant="default">Can't send</Badge>}
      </button>
      {option.message && (selected || blocked) && (
        <p
          className="flex items-start gap-1 px-2 pb-1 text-[11px]"
          style={{ color: blocked ? 'var(--neg)' : 'var(--warn)' }}
        >
          <AlertTriangle size={11} className="mt-0.5 shrink-0" />
          {option.message}
        </p>
      )}
    </div>
  );
}

/** The one-line summary the row shows once a stand-in is chosen. */
export function SubstituteSummary({ substitutes, choice, onEdit }: {
  substitutes: SubstituteOption[];
  choice: SubstituteChoice;
  onEdit: () => void;
}) {
  const chosen = substitutes.find((s) => s.itemId === choice.itemId);
  if (!chosen) return null;
  return (
    <button
      type="button"
      onClick={onEdit}
      className="mt-1 flex items-center gap-1 text-[11.5px] hover:underline"
      style={{ color: 'var(--accent-text)' }}
    >
      <ArrowLeftRight size={11} />
      Sending {withUom(chosen.itemName, chosen.uom)} instead
    </button>
  );
}

/** Opens the panel. Absent when the item master declares no stand-ins. */
export function SubstituteButton({ substitutes, onClick }: {
  substitutes: SubstituteOption[];
  onClick: () => void;
}) {
  if (substitutes.length === 0) return null;
  return (
    <Button
      variant="secondary"
      onClick={onClick}
      className="mt-1 h-6 px-1.5 text-[11.5px]"
    >
      <ArrowLeftRight size={11} /> Substitute
    </Button>
  );
}
