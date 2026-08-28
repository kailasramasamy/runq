import { useState } from 'react';
import { ArrowLeftRight, Check } from 'lucide-react';
import { Button, Card, CardContent, useToast } from '@/components/ui';
import type { DnLine } from '@/hooks/queries/use-inventory';
import {
  useDraftSubstitutes, useSubstituteDraftLine, useRelabelInvoiceLine,
  type SubstituteOption,
} from '@/hooks/queries/use-sales-dispatch';
import { SubstitutePanel, withUom, type SubstituteChoice } from './_substitute-picker';

/**
 * Substituting on a delivery note that already exists.
 *
 * Most substitutions are decided here rather than on the dispatch screen.
 * Auto-dispatch met the shortage hours earlier, shipped what it could and
 * parked the rest; the operator arrives later, at the draft, and this is the
 * only place the decision can still be made.
 *
 * Saved on the spot rather than collected for a submit: the draft is already
 * a persisted document, so a choice held in local state until some later
 * button would be lost by any navigation and would disagree with what the
 * Dispatch button is about to post.
 */
export function DraftLineSubstitute({ dnId, line }: { dnId: string; line: DnLine }) {
  const { toast } = useToast();
  const { data: byLine } = useDraftSubstitutes(dnId);
  const save = useSubstituteDraftLine();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<SubstituteChoice>({ itemId: null, note: '' });

  const options: SubstituteOption[] = byLine?.[line.id] ?? [];
  const swapped = !!line.substitutedForItemId;
  if (options.length === 0 && !swapped) return null;

  async function confirm() {
    if (!choice.itemId) return;
    try {
      await save.mutateAsync({
        dnId, lineId: line.id, itemId: choice.itemId, note: choice.note.trim() || null,
      });
      toast('Substitute set — dispatch to send it', 'success');
      setOpen(false);
      setChoice({ itemId: null, note: '' });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not substitute', 'error');
    }
  }

  if (swapped) {
    return (
      <div className="mt-1 flex items-center gap-1 text-[11.5px]" style={{ color: 'var(--accent-text)' }}>
        <ArrowLeftRight size={11} />
        Substituted{line.substitutionNote ? ` — ${line.substitutionNote}` : ''}
      </div>
    );
  }

  return open ? (
    <SubstitutePanel
      billedName={withUom(line.itemName, line.uom)}
      substitutes={options}
      choice={choice}
      onChange={setChoice}
      onClose={() => setOpen(false)}
      confirmLabel="Use substitute"
      onConfirm={confirm}
      busy={save.isPending}
    />
  ) : (
    <Button variant="secondary" onClick={() => setOpen(true)} className="mt-1 h-6 px-1.5 text-[11.5px]">
      <ArrowLeftRight size={11} /> Substitute
    </Button>
  );
}

/**
 * After the goods have gone: offer to make the invoice say what was sent.
 *
 * Only offered, never automatic. Leaving the invoice as billed is a coherent
 * position — the customer is charged what they were quoted and the swap is on
 * the delivery note — so this is a second, explicit decision rather than a
 * consequence of the first.
 *
 * The edit itself is only the item and its description. The substitution
 * guard has already forced HSN and GST rate to match, and the billed price is
 * held, so the invoice total, the tax split and every posting stay exactly
 * where they were.
 */
export function RelabelInvoiceOffer({ invoiceId, lines }: {
  invoiceId: string;
  lines: DnLine[];
}) {
  const { toast } = useToast();
  const relabel = useRelabelInvoiceLine();
  const [done, setDone] = useState<Record<string, boolean>>({});

  const swapped = lines.filter((l) => l.substitutedForItemId && l.invoiceLineId);
  if (swapped.length === 0) return null;

  async function apply(line: DnLine) {
    try {
      await relabel.mutateAsync({ invoiceId, lineId: line.invoiceLineId! });
      setDone((p) => ({ ...p, [line.id]: true }));
      toast('Invoice updated to show what was delivered', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not update the invoice', 'error');
    }
  }

  return (
    <Card className="mt-4">
      <CardContent>
        <div className="mb-1 flex items-center gap-1.5 text-[13px] font-medium">
          <ArrowLeftRight size={14} style={{ color: 'var(--text-3)' }} />
          Sent a substitute
        </div>
        <p className="mb-3 text-[12px]" style={{ color: 'var(--text-3)' }}>
          The invoice still names what was billed. Leave it that way, or update it
          to name what actually left — which also charges that item's own rate, so
          the line total changes. HSN and tax stay as they were.
        </p>
        <div className="space-y-2">
          {swapped.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center gap-2">
              <span className="min-w-52 flex-1 text-[12.5px]">
                Sent <strong>{withUom(l.itemName, l.uom)}</strong>
                {l.substitutionNote && (
                  <span style={{ color: 'var(--text-3)' }}> · {l.substitutionNote}</span>
                )}
              </span>
              {done[l.id] ? (
                <span
                  className="flex items-center gap-1 text-[12px]"
                  style={{ color: 'var(--accent-text)' }}
                >
                  <Check size={12} /> Invoice updated
                </span>
              ) : (
                <Button
                  variant="secondary"
                  className="h-7 px-2 text-[12px]"
                  disabled={relabel.isPending}
                  onClick={() => apply(l)}
                >
                  Update invoice to {withUom(l.itemName, l.uom)}
                </Button>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
