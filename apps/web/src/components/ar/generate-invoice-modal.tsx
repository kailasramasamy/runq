import { useState } from 'react';
import { Zap, Copy, Check } from 'lucide-react';
import { Button, Input, DateInput, useToast } from '@/components/ui';
import { formatINR } from '@/lib/utils';
import { useItems } from '@/hooks/queries/use-items';
import {
  useGenerateFromTemplate,
  type QuickInvoiceTemplate,
} from '@/hooks/queries/use-quick-templates';

interface GenerateSuccessResult {
  invoiceNumber: string;
  invoiceId: string;
  shareUrl?: string;
}

export function GenerateInvoiceModal({ template, onClose }: {
  template: QuickInvoiceTemplate;
  onClose: () => void;
}) {
  const generate = useGenerateFromTemplate();
  const { toast } = useToast();
  // Unit (UOM) isn't stored on the template — look it up from the item master.
  const { data: itemsData } = useItems({ limit: 500 });
  const unitByItemId = new Map((itemsData?.data ?? []).map((i) => [i.id, i.unit ?? null]));

  const today = new Date().toISOString().slice(0, 10);
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [quantities, setQuantities] = useState<Record<string, string>>(
    Object.fromEntries(template.items.map((it) => [it.itemId, it.defaultQuantity ? String(it.defaultQuantity) : ''])),
  );
  const [success, setSuccess] = useState<GenerateSuccessResult | null>(null);
  const [copied, setCopied] = useState(false);

  function setQty(itemId: string, value: string) {
    setQuantities((p) => ({ ...p, [itemId]: value }));
  }

  // Landing price = base unit price + GST. The grid shows the all-in price the
  // customer pays per unit so totals match what they expect to see.
  const lineSubtotals = template.items.map((it) => {
    const qty = Number(quantities[it.itemId] ?? it.defaultQuantity);
    const landingPrice = it.unitPrice * (1 + (it.taxRate ?? 0) / 100);
    const lineAmt = qty * landingPrice;
    return { landingPrice, lineAmt };
  });
  const subtotal = lineSubtotals.reduce((s, l) => s + l.lineAmt, 0);
  const total = subtotal;

  async function handleGenerate() {
    try {
      const res = await generate.mutateAsync({
        id: template.id,
        data: {
          invoiceDate,
          quantities: Object.fromEntries(
            template.items.map((it) => [
              it.itemId,
              Number(quantities[it.itemId] ?? it.defaultQuantity),
            ]),
          ),
        },
      });
      setSuccess({
        invoiceNumber: res.data.invoiceNumber,
        invoiceId: res.data.invoiceId,
        shareUrl: res.data.shareUrl,
      });
      toast(`Invoice ${res.data.invoiceNumber} created`, 'success');
    } catch {
      toast('Failed to generate invoice', 'error');
    }
  }

  async function copyLink() {
    if (!success?.shareUrl) return;
    await navigator.clipboard.writeText(success.shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function whatsappShare() {
    if (!success) return;
    const msg = encodeURIComponent(`Invoice ${success.invoiceNumber}${success.shareUrl ? `\n${success.shareUrl}` : ''}`);
    window.open(`https://wa.me/?text=${msg}`, '_blank');
  }

  if (success) {
    return (
      <div className="space-y-6 text-center">
        <div className="space-y-1">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Invoice generated successfully</p>
          <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{success.invoiceNumber}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {success.shareUrl && (
            <Button variant="outline" size="sm" onClick={copyLink}>
              {copied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy Link</>}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={whatsappShare}>
            <Zap size={14} /> Send via WhatsApp
          </Button>
        </div>
        <Button size="sm" onClick={onClose}>Done</Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <DateInput
        label="Invoice Date"
        value={invoiceDate}
        onChange={(e) => setInvoiceDate(e.target.value)}
      />

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs text-zinc-400 dark:border-zinc-800">
              <th className="pb-2 pr-4 font-medium">Product</th>
              <th className="pb-2 pr-4 text-right font-medium">Unit Price <span className="font-normal text-zinc-400">(incl. GST)</span></th>
              <th className="pb-2 pr-4 text-right font-medium">GST %</th>
              <th className="pb-2 pr-4 text-center font-medium w-24">Quantity</th>
              <th className="pb-2 text-right font-medium">Line Total</th>
            </tr>
          </thead>
          <tbody>
            {template.items.map((it, idx) => {
              const qty = Number(quantities[it.itemId] ?? it.defaultQuantity);
              const { landingPrice, lineAmt } = lineSubtotals[idx];
              return (
                <tr key={it.itemId} className="border-b border-zinc-100 dark:border-zinc-800/50">
                  <td className="py-2 pr-4 font-medium text-zinc-800 dark:text-zinc-200">
                    {it.description}
                    {unitByItemId.get(it.itemId) && (
                      <span className="ml-1 text-xs text-zinc-400">({unitByItemId.get(it.itemId)})</span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-right font-mono text-zinc-500">{formatINR(landingPrice)}</td>
                  <td className="py-2 pr-4 text-right font-mono text-zinc-500">{it.taxRate ?? 0}%</td>
                  <td className="py-2 pr-4 w-24">
                    <Input
                      type="number"
                      value={quantities[it.itemId] ?? String(it.defaultQuantity)}
                      onChange={(e) => setQty(it.itemId, e.target.value)}
                      min={0}
                    />
                  </td>
                  <td className="py-2 text-right font-mono font-medium">{formatINR(lineAmt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="ml-auto w-56 space-y-1 text-sm">
        <div className="flex justify-between text-zinc-500">
          <span>Subtotal</span>
          <span className="font-mono">{formatINR(subtotal)}</span>
        </div>
        <div className="flex justify-between border-t border-zinc-200 pt-1 font-semibold dark:border-zinc-700">
          <span>Total</span>
          <span className="font-mono">{formatINR(total)}</span>
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" onClick={handleGenerate} loading={generate.isPending}>
          <Zap size={14} /> Generate Invoice
        </Button>
      </div>
    </div>
  );
}
