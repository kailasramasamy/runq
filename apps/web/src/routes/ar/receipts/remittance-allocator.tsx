import { useMemo, useState } from 'react';
import { ListChecks } from 'lucide-react';
import { useInvoices } from '../../../hooks/queries/use-invoices';
import { useUpdateReceiptAllocations } from '../../../hooks/queries/use-receipts';
import type { ReceiptWithAllocations } from '../../../hooks/queries/use-receipts';
import { receiptAllocation } from './allocation-status';
import { formatINR } from '../../../lib/utils';
import {
  Card, CardHeader, CardContent, Button, Textarea, Badge,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, useToast,
} from '@/components/ui';

interface ParsedLine { number: string; amount: number }
interface ResolvedLine extends ParsedLine { invoiceId?: string; headroom?: number; ok: boolean; reason?: string }

/** ₹ tolerance for closing an individual invoice in full within a sub-rupee gap. */
const ROUNDING_TOLERANCE = 1;
/** Max aggregate remittance-vs-cash overshoot auto-written-off to Round Off. */
const AGG_ROUND_OFF_MAX = 5;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Parse pasted rows: "<invoice no> <amount>" separated by tab, comma, or spaces. */
function parseRemittance(text: string): ParsedLine[] {
  const out: ParsedLine[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    // Split only at the first separator: the invoice number is the first token,
    // the amount is the rest. This preserves thousands-separator commas inside
    // the amount (e.g. "5,058.83") instead of splitting them into columns.
    const sep = line.search(/[,\s]/);
    if (sep < 0) continue;
    const number = line.slice(0, sep).trim();
    const amount = Number(line.slice(sep).replace(/[₹,\s]/g, ''));
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
      // A remittance line routinely states a few paise more than the invoice
      // balance (the customer's own rounding). Accept up to ₹1 over and settle
      // the invoice in full at its balance (see `effective` below); only a
      // larger overshoot is a real "wrong amount" error.
      if (l.amount - headroom > ROUNDING_TOLERANCE) return { ...l, invoiceId: inv.id, headroom, ok: false, reason: `Exceeds available ${formatINR(headroom)}` };
      return { ...l, invoiceId: inv.id, headroom, ok: true };
    });
  }, [text, invData, receipt.allocations]);

  // A remittance advice routinely states a few paise more per invoice than the
  // invoice balance (the customer's own rounding). We cap each line at its
  // available headroom (see `effective`) so the invoice settles in full without
  // over-receiving; any genuine aggregate overshoot beyond the ceiling blocks.
  const lines = resolved;
  // Amount actually posted for a line: capped at the invoice's available
  // headroom so a paise-over remittance settles the invoice in full instead of
  // over-receiving it. The customer's stated amount still shows in the table.
  const effective = (r: ResolvedLine): number => (r.ok && r.headroom != null ? Math.min(r.amount, r.headroom) : r.amount);
  const allocSum = round2(lines.reduce((s, r) => s + effective(r), 0));
  const overBy = round2(allocSum - receipt.amount);
  const hasErrors = lines.some((r) => !r.ok);
  const overReceipt = overBy > AGG_ROUND_OFF_MAX;
  const canApply = lines.length > 0 && !hasErrors && !overReceipt;

  // Preview the total that lands in Round Off server-side: per-invoice sub-rupee
  // gaps (a line settling an invoice within ₹1) plus any aggregate overshoot.
  const perInvoiceRoundOff = lines.reduce((s, r) => {
    const gap = r.ok && r.headroom != null ? round2(r.headroom - r.amount) : 0;
    return gap > 0.005 && gap <= ROUNDING_TOLERANCE ? s + gap : s;
  }, 0);
  const roundOff = round2(perInvoiceRoundOff + (overBy > 0.005 ? overBy : 0));

  function apply() {
    const allocations = lines.filter((r) => r.ok && r.invoiceId).map((r) => ({ invoiceId: r.invoiceId!, amount: round2(effective(r)) }));
    update.mutate(allocations, {
      onSuccess: () => { toast(`Allocated to ${allocations.length} invoice(s).`, 'success'); setText(''); setOpen(false); },
      onError: (e) => toast(e instanceof Error ? e.message : 'Failed to allocate.', 'error'),
    });
  }

  const remainder = receipt.amount - allocSum;
  const fullyAllocated = receiptAllocation(receipt).status === 'allocated';

  return (
    <Card>
      <CardHeader
        title="Allocate from remittance"
        action={<Button variant={open ? 'ghost' : 'outline'} size="sm" onClick={() => setOpen((o) => !o)}>
          <ListChecks size={14} /> {open ? 'Close' : fullyAllocated ? 'Re-allocate' : 'Paste remittance'}
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
          {lines.length > 0 && (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <tr><Th>Invoice #</Th><Th align="right">Amount</Th><Th align="right">Available</Th><Th>Status</Th></tr>
                  </TableHeader>
                  <TableBody>
                    {lines.map((r, i) => (
                      <TableRow key={`${r.number}-${i}`}>
                        <TableCell className="font-mono text-xs">{r.number}</TableCell>
                        <TableCell align="right" numeric>{formatINR(r.amount)}</TableCell>
                        <TableCell align="right" numeric>{r.headroom != null ? formatINR(r.headroom) : '—'}</TableCell>
                        <TableCell>
                          {!r.ok ? (
                            <Badge variant="danger" title={r.reason}>{r.reason}</Badge>
                          ) : effective(r) < r.amount - 0.005 ? (
                            <Badge variant="success" title={`Settles invoice in full · ${formatINR(round2(r.amount - effective(r)))} rounding dropped`}>Settles in full</Badge>
                          ) : (
                            <Badge variant="success">OK</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-500 dark:text-zinc-400">
                  {lines.length} line(s) · Allocated <span className="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">{formatINR(allocSum)}</span> of {formatINR(receipt.amount)}
                  {remainder > 0.01 && <span className="ml-1 text-amber-600 dark:text-amber-400">· {formatINR(remainder)} stays on-account</span>}
                  {roundOff > 0.005 && <span className="ml-1 text-blue-600 dark:text-blue-400">· {formatINR(roundOff)} booked to Round Off</span>}
                  {overReceipt && <span className="ml-1 text-red-600 dark:text-red-400">· exceeds receipt by more than {formatINR(AGG_ROUND_OFF_MAX)}</span>}
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
