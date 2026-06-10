import { useMemo, useState } from 'react';
import { ListChecks } from 'lucide-react';
import { useInvoices } from '../../../hooks/queries/use-invoices';
import { useUpdateReceiptAllocations } from '../../../hooks/queries/use-receipts';
import type { ReceiptWithAllocations } from '../../../hooks/queries/use-receipts';
import { formatINR } from '../../../lib/utils';
import {
  Card, CardHeader, CardContent, Button, Textarea, Badge,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, useToast,
} from '@/components/ui';

interface ParsedLine { number: string; amount: number }
interface ResolvedLine extends ParsedLine { invoiceId?: string; headroom?: number; ok: boolean; reason?: string }

/** Parse pasted rows: "<invoice no> <amount>" separated by tab, comma, or spaces. */
function parseRemittance(text: string): ParsedLine[] {
  const out: ParsedLine[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(/[\t,]|\s{2,}|\s+/).filter(Boolean);
    if (parts.length < 2) continue;
    const number = parts[0]!.trim();
    const amount = Number(parts[parts.length - 1]!.replace(/[₹,]/g, ''));
    if (!number || !Number.isFinite(amount) || amount <= 0) continue;
    out.push({ number, amount });
  }
  return out;
}

export function RemittanceAllocator({ receipt }: { receipt: ReceiptWithAllocations }) {
  const { toast } = useToast();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const { data: invData } = useInvoices({ customerId: receipt.customerId, limit: 500 });
  const update = useUpdateReceiptAllocations(receipt.id);

  const resolved = useMemo<ResolvedLine[]>(() => {
    const invByNum = new Map((invData?.data ?? []).map((i) => [i.invoiceNumber, i]));
    // This receipt's existing allocation frees up headroom on re-allocation.
    const ownAlloc = new Map(receipt.allocations.map((a) => [a.invoiceNumber, a.amount]));
    return parseRemittance(text).map((l) => {
      const inv = invByNum.get(l.number);
      if (!inv) return { ...l, ok: false, reason: 'Invoice not found' };
      const headroom = Number(inv.balanceDue) + (ownAlloc.get(l.number) ?? 0);
      if (l.amount - headroom > 0.01) return { ...l, invoiceId: inv.id, headroom, ok: false, reason: `Exceeds available ${formatINR(headroom)}` };
      return { ...l, invoiceId: inv.id, headroom, ok: true };
    });
  }, [text, invData, receipt.allocations]);

  const allocSum = resolved.reduce((s, r) => s + r.amount, 0);
  const hasErrors = resolved.some((r) => !r.ok);
  const overReceipt = allocSum - receipt.amount > 0.01;
  const canApply = resolved.length > 0 && !hasErrors && !overReceipt;

  function apply() {
    const allocations = resolved.filter((r) => r.ok && r.invoiceId).map((r) => ({ invoiceId: r.invoiceId!, amount: r.amount }));
    update.mutate(allocations, {
      onSuccess: () => { toast(`Allocated to ${allocations.length} invoice(s).`, 'success'); setText(''); setOpen(false); },
      onError: (e) => toast(e instanceof Error ? e.message : 'Failed to allocate.', 'error'),
    });
  }

  const remainder = receipt.amount - allocSum;

  return (
    <Card>
      <CardHeader
        title="Allocate from remittance"
        action={<Button variant={open ? 'ghost' : 'outline'} size="sm" onClick={() => setOpen((o) => !o)}>
          <ListChecks size={14} /> {open ? 'Close' : 'Paste remittance'}
        </Button>}
      />
      {open && (
        <CardContent className="space-y-3">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Paste invoice number + amount per line (copy two columns from Excel). This replaces the receipt's current allocations.
          </p>
          <Textarea
            rows={6}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'260459\t3919.69\n260460\t9896.24'}
            className="font-mono text-xs"
          />
          {resolved.length > 0 && (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <tr><Th>Invoice #</Th><Th align="right">Amount</Th><Th align="right">Available</Th><Th>Status</Th></tr>
                  </TableHeader>
                  <TableBody>
                    {resolved.map((r, i) => (
                      <TableRow key={`${r.number}-${i}`}>
                        <TableCell className="font-mono text-xs">{r.number}</TableCell>
                        <TableCell align="right" numeric>{formatINR(r.amount)}</TableCell>
                        <TableCell align="right" numeric>{r.headroom != null ? formatINR(r.headroom) : '—'}</TableCell>
                        <TableCell>
                          {r.ok ? <Badge variant="success">OK</Badge> : <Badge variant="danger" title={r.reason}>{r.reason}</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-500 dark:text-zinc-400">
                  {resolved.length} line(s) · Allocated <span className="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">{formatINR(allocSum)}</span> of {formatINR(receipt.amount)}
                  {remainder > 0.01 && <span className="ml-1 text-amber-600 dark:text-amber-400">· {formatINR(remainder)} stays on-account</span>}
                  {overReceipt && <span className="ml-1 text-red-600 dark:text-red-400">· exceeds receipt</span>}
                </span>
                <Button size="sm" onClick={apply} loading={update.isPending} disabled={!canApply}>Apply allocations</Button>
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
