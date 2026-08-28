import { useEffect, useState } from 'react';
import { ArrowLeftRight, X } from 'lucide-react';
import {
  Card, CardContent, Button, Combobox, Badge, useToast,
} from '@/components/ui';
import { useItems } from '@/hooks/queries/use-items';
import {
  useItemSubstitutes, useSetItemSubstitutes,
} from '@/hooks/queries/use-sales-dispatch';

/**
 * What may go out in this item's place when the shelf is empty.
 *
 * Declared here rather than inferred at dispatch, because "close enough to
 * send" is a commercial judgement no rule about categories or pack sizes gets
 * right: A2 milk covers a Farm Fresh order, and the reverse gives away the
 * premium. A list somebody wrote is the only honest source.
 *
 * Nothing here changes what a customer is charged. The dispatch screen holds
 * the guard that refuses a stand-in whose HSN or GST rate differs, and asks
 * for a reason when its price does.
 */
export function SubstitutesCard({ itemId, itemName }: { itemId: string; itemName: string }) {
  const { toast } = useToast();
  const { data: declared = [], isLoading } = useItemSubstitutes(itemId);
  const save = useSetItemSubstitutes();
  const itemsRes = useItems({ status: 'active', limit: 500 });

  const [chosen, setChosen] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  // Server order is the offer order, so the list is seeded from it rather
  // than merged — an edit in flight would otherwise fight the refetch.
  useEffect(() => {
    if (!dirty) setChosen(declared.map((d) => d.itemId));
  }, [declared, dirty]);

  const catalogue = (itemsRes.data?.data ?? []).filter(
    (i) => i.type === 'product' && i.id !== itemId && !chosen.includes(i.id),
  );
  const nameOf = (id: string) =>
    declared.find((d) => d.itemId === id)?.itemName
    ?? (itemsRes.data?.data ?? []).find((i) => i.id === id)?.name
    ?? id;

  async function persist(next: string[]) {
    try {
      await save.mutateAsync({ itemId, substituteItemIds: next });
      setDirty(false);
      toast('Substitutes updated', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save substitutes', 'error');
    }
  }

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="mb-1 flex items-center gap-1.5 text-[13px] font-medium">
          <ArrowLeftRight size={14} style={{ color: 'var(--text-3)' }} />
          Substitutes
        </div>
        <p className="mb-3 text-[12px]" style={{ color: 'var(--text-3)' }}>
          Items the warehouse may send in place of {itemName} when it runs short.
          Offered on the dispatch screen, in this order.
        </p>

        {isLoading ? (
          <div className="text-[12.5px]" style={{ color: 'var(--text-3)' }}>Loading…</div>
        ) : (
          <>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {chosen.length === 0 && (
                <span className="text-[12.5px]" style={{ color: 'var(--text-3)' }}>
                  None declared — a shortage on this item has no one-tap way out.
                </span>
              )}
              {chosen.map((id) => (
                <Badge key={id} variant="primary" className="flex items-center gap-1">
                  {nameOf(id)}
                  <button
                    type="button"
                    aria-label={`Remove ${nameOf(id)}`}
                    onClick={() => { setDirty(true); setChosen(chosen.filter((c) => c !== id)); }}
                    className="hover:opacity-70"
                  >
                    <X size={11} />
                  </button>
                </Badge>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="w-72">
                <Combobox
                  options={catalogue.map((i) => ({
                    value: i.id,
                    label: `${i.name}${i.sku ? ` · ${i.sku}` : ''}`,
                  }))}
                  value=""
                  onChange={(v) => {
                    if (!v) return;
                    setDirty(true);
                    setChosen([...chosen, v]);
                  }}
                  placeholder="Add a substitute…"
                  inputClassName="h-8 py-0 text-[12.5px]"
                />
              </div>
              {dirty && (
                <>
                  <Button
                    variant="primary"
                    className="h-8 px-3 text-[12.5px]"
                    disabled={save.isPending}
                    onClick={() => persist(chosen)}
                  >
                    {save.isPending ? 'Saving…' : 'Save substitutes'}
                  </Button>
                  <Button
                    variant="secondary"
                    className="h-8 px-3 text-[12.5px]"
                    onClick={() => { setDirty(false); setChosen(declared.map((d) => d.itemId)); }}
                  >
                    Cancel
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
