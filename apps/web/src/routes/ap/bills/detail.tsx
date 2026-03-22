import { useState } from 'react';
import { Check, X, AlertTriangle, FileWarning } from 'lucide-react';
import {
  usePurchaseInvoice,
  useThreeWayMatch,
  useApproveInvoice,
  useDeletePurchaseInvoice,
} from '../../../hooks/queries/use-purchase-invoices';
import { useDebitNotes } from '../../../hooks/queries/use-debit-notes';
import type { PurchaseInvoiceWithDetails, PurchaseInvoiceStatus, MatchStatus, DebitNote } from '@runq/types';
import type { MatchLineResult, ThreeWayMatchResult } from '@runq/types';
import { formatINR } from '../../../lib/utils';
import {
  PageHeader,
  Badge,
  Button,
  Card,
  CardHeader,
  CardContent,
  Input,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  Th,
  StatsCard,
  ConfirmationDialog,
} from '@/components/ui';

// ─── Badge helpers ────────────────────────────────────────────────────────────

const STATUS_BADGE_VARIANT: Record<PurchaseInvoiceStatus, React.ComponentProps<typeof Badge>['variant']> = {
  draft: 'default',
  pending_match: 'warning',
  matched: 'info',
  approved: 'primary',
  partially_paid: 'cyan',
  paid: 'success',
  cancelled: 'outline',
};

const STATUS_LABELS: Record<PurchaseInvoiceStatus, string> = {
  draft: 'Draft',
  pending_match: 'Pending Match',
  matched: 'Matched',
  approved: 'Approved',
  partially_paid: 'Partially Paid',
  paid: 'Paid',
  cancelled: 'Cancelled',
};

const MATCH_BADGE_VARIANT: Record<MatchStatus, React.ComponentProps<typeof Badge>['variant']> = {
  unmatched: 'outline',
  matched: 'success',
  mismatch: 'danger',
};

// ─── Match Form ───────────────────────────────────────────────────────────────

function MatchForm({ invoiceId, onDone }: { invoiceId: string; onDone: () => void }) {
  const [poId, setPoId] = useState('');
  const [grnId, setGrnId] = useState('');
  const matchMutation = useThreeWayMatch();

  function handleMatch(e: React.FormEvent) {
    e.preventDefault();
    if (!poId || !grnId) return;
    matchMutation.mutate({ id: invoiceId, poId, grnId }, { onSuccess: onDone });
  }

  return (
    <form onSubmit={handleMatch}>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <Input
          label="PO ID (UUID)"
          value={poId}
          onChange={(e) => setPoId(e.target.value)}
          placeholder="xxxxxxxx-xxxx-…"
        />
        <Input
          label="GRN ID (UUID)"
          value={grnId}
          onChange={(e) => setGrnId(e.target.value)}
          placeholder="xxxxxxxx-xxxx-…"
        />
      </div>
      <div className="flex items-center gap-3">
        <Button
          type="submit"
          variant="primary"
          size="sm"
          loading={matchMutation.isPending}
          disabled={!poId || !grnId}
        >
          Run Match
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ─── Match Result Panel ───────────────────────────────────────────────────────

function MatchResultPanel({ result }: { result: ThreeWayMatchResult }) {
  return (
    <Card className="mt-4">
      <CardHeader title="Match Result" />
      <CardContent>
        <div className="mb-4 grid grid-cols-3 gap-4 text-center text-sm">
          <div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">PO Total</p>
            <p className="font-mono font-medium tabular-nums">{formatINR(result.summary.poTotal)}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">GRN Total</p>
            <p className="font-mono font-medium tabular-nums">{formatINR(result.summary.grnTotal)}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">Invoice Total</p>
            <p className="font-mono font-medium tabular-nums">{formatINR(result.summary.invoiceTotal)}</p>
          </div>
        </div>
        <Table>
          <TableHeader>
            <tr>
              <Th>Item</Th>
              <Th>SKU</Th>
              <Th align="right">PO Qty</Th>
              <Th align="right">GRN Qty</Th>
              <Th align="right">Inv Qty</Th>
              <Th align="right">PO Price</Th>
              <Th align="right">Inv Price</Th>
              <Th>Result</Th>
              <Th>Notes</Th>
            </tr>
          </TableHeader>
          <TableBody>
            {result.lines.map((line: MatchLineResult, i: number) => {
              const isMatched = line.status === 'matched';
              return (
                <TableRow
                  key={i}
                  className={
                    isMatched
                      ? 'bg-green-50 dark:bg-green-950/20'
                      : 'bg-red-50 dark:bg-red-950/20'
                  }
                >
                  <TableCell>{line.itemName}</TableCell>
                  <TableCell>
                    <span className="font-mono text-xs">{line.sku ?? '—'}</span>
                  </TableCell>
                  <TableCell align="right" numeric>{line.qty.po}</TableCell>
                  <TableCell align="right" numeric>{line.qty.grn}</TableCell>
                  <TableCell align="right" numeric>{line.qty.invoice}</TableCell>
                  <TableCell align="right" numeric>{formatINR(line.unitPrice.po)}</TableCell>
                  <TableCell align="right" numeric>{formatINR(line.unitPrice.invoice)}</TableCell>
                  <TableCell>
                    {isMatched ? (
                      <Check size={14} className="text-green-600 dark:text-green-400" />
                    ) : (
                      <X size={14} className="text-red-600 dark:text-red-400" />
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-zinc-500 dark:text-zinc-400">
                    {line.message ?? '—'}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ─── Actions Panel ────────────────────────────────────────────────────────────

function ActionsPanel({ invoice }: { invoice: PurchaseInvoiceWithDetails }) {
  const [showMatchForm, setShowMatchForm] = useState(false);
  const [matchResult, setMatchResult] = useState<ThreeWayMatchResult | null>(null);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const approveMutation = useApproveInvoice();
  const deleteMutation = useDeletePurchaseInvoice();

  const approveDialog = (
    <ConfirmationDialog
      open={showApproveDialog}
      onClose={() => setShowApproveDialog(false)}
      onConfirm={() => {
        approveMutation.mutate({ id: invoice.id }, { onSuccess: () => setShowApproveDialog(false) });
      }}
      title="Approve Bill"
      description={`Approve bill ${invoice.invoiceNumber} for ₹${Number(invoice.totalAmount).toLocaleString('en-IN')}? Once approved, it will be available for payment.`}
      confirmLabel="Approve"
      variant="warning"
      loading={approveMutation.isPending}
    />
  );

  const cancelDialog = (
    <ConfirmationDialog
      open={showCancelDialog}
      onClose={() => setShowCancelDialog(false)}
      onConfirm={() => {
        deleteMutation.mutate(invoice.id, { onSuccess: () => setShowCancelDialog(false) });
      }}
      title="Cancel Bill"
      description={`Cancel bill ${invoice.invoiceNumber}? You can create a revised bill afterwards.`}
      confirmLabel="Cancel Bill"
      variant="danger"
      loading={deleteMutation.isPending}
    />
  );

  if (invoice.status === 'draft' && !invoice.poId) {
    return (
      <Card>
        <CardHeader title="Approval" />
        <CardContent>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
            This bill has no linked Purchase Order. You can approve it directly or link a PO for 3-way matching.
          </p>
          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowApproveDialog(true)}
            >
              Approve Bill
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowMatchForm(true)}>
              Link PO &amp; Match
            </Button>
          </div>
          {showMatchForm && (
            <div className="mt-4 border-t border-zinc-200 dark:border-zinc-800 pt-4">
              <MatchForm
                invoiceId={invoice.id}
                onDone={() => { setShowMatchForm(false); setMatchResult(null); }}
              />
            </div>
          )}
          {matchResult && <MatchResultPanel result={matchResult} />}
        </CardContent>
        {approveDialog}
      </Card>
    );
  }

  if (invoice.status === 'draft' && invoice.poId) {
    return (
      <Card>
        <CardHeader title="3-Way Match Required" />
        <CardContent>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
            This bill is linked to a PO. Run 3-way matching before approval.
          </p>
          <MatchForm
            invoiceId={invoice.id}
            onDone={() => { setShowMatchForm(false); setMatchResult(null); }}
          />
          {matchResult && <MatchResultPanel result={matchResult} />}
        </CardContent>
      </Card>
    );
  }

  if (invoice.status === 'pending_match') {
    return (
      <Card className="border-amber-200 dark:border-amber-800">
        <CardHeader title="Mismatch Detected" />
        <CardContent>
          <div className="mb-4 flex items-start gap-3 rounded-md bg-amber-50 dark:bg-amber-900/20 p-3">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                Match failed — review the details below before re-running.
              </p>
              {invoice.matchNotes && (
                <p className="mt-1 whitespace-pre-wrap text-xs text-amber-700 dark:text-amber-400">
                  {invoice.matchNotes}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {showMatchForm ? (
              <MatchForm invoiceId={invoice.id} onDone={() => setShowMatchForm(false)} />
            ) : (
              <>
                <Button variant="primary" size="sm" onClick={() => setShowMatchForm(true)}>
                  Re-run Match
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowCancelDialog(true)}
                >
                  Cancel Bill
                </Button>
              </>
            )}
          </div>
        </CardContent>
        {cancelDialog}
      </Card>
    );
  }

  if (invoice.status === 'matched') {
    return (
      <Card className="border-green-200 dark:border-green-800">
        <CardHeader title="Match Successful" />
        <CardContent>
          <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
            All line items matched. Review and approve this bill to proceed to payment.
          </p>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowApproveDialog(true)}
          >
            Approve Bill
          </Button>
        </CardContent>
        {approveDialog}
      </Card>
    );
  }

  if (invoice.status === 'approved') {
    return (
      <Card className="border-indigo-200 dark:border-indigo-800">
        <CardHeader title="Approved" />
        <CardContent>
          <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
            This bill has been approved. You can now record a payment against it.
          </p>
          <Button variant="outline" size="sm" disabled>
            Record Payment (coming soon)
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (invoice.status === 'partially_paid' || invoice.status === 'paid') {
    return (
      <Card>
        <CardHeader title="Payment History" />
        <CardContent>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Payment history will be shown here once payments are recorded.
          </p>
        </CardContent>
      </Card>
    );
  }

  return null;
}

// ─── Line Items Table ─────────────────────────────────────────────────────────

function LineItemsTable({ invoice }: { invoice: PurchaseInvoiceWithDetails }) {
  return (
    <Card>
      <CardHeader title="Line Items" />
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <tr>
              <Th>Item</Th>
              <Th>SKU</Th>
              <Th align="right">Qty</Th>
              <Th align="right">Unit Price</Th>
              <Th align="right">Amount</Th>
            </tr>
          </TableHeader>
          <TableBody>
            {invoice.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.itemName}</TableCell>
                <TableCell>
                  <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                    {item.sku ?? '—'}
                  </span>
                </TableCell>
                <TableCell align="right" numeric>{item.quantity}</TableCell>
                <TableCell align="right" numeric>{formatINR(item.unitPrice)}</TableCell>
                <TableCell align="right" numeric>{formatINR(item.amount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      <div className="flex justify-end gap-8 px-4 py-3 text-sm border-t border-zinc-200 dark:border-zinc-800">
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex w-52 justify-between gap-6">
            <span className="text-zinc-500 dark:text-zinc-400">Subtotal</span>
            <span className="font-mono tabular-nums">{formatINR(invoice.subtotal)}</span>
          </div>
          <div className="flex w-52 justify-between gap-6">
            <span className="text-zinc-500 dark:text-zinc-400">Tax</span>
            <span className="font-mono tabular-nums">{formatINR(invoice.taxAmount)}</span>
          </div>
          <div className="flex w-52 justify-between gap-6 border-t border-zinc-200 pt-1.5 dark:border-zinc-700">
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">Total</span>
            <span className="font-mono font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
              {formatINR(invoice.totalAmount)}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ─── Debit Note Adjustments ──────────────────────────────────────────────────

function DebitNoteAdjustments({ invoiceId }: { invoiceId: string }) {
  const { data } = useDebitNotes({ invoiceId });
  const debitNotes = (data?.data ?? []).filter((dn: DebitNote) => dn.status === 'adjusted' || dn.status === 'issued');

  if (debitNotes.length === 0) return null;

  const totalAdjusted = debitNotes
    .filter((dn: DebitNote) => dn.status === 'adjusted')
    .reduce((sum: number, dn: DebitNote) => sum + dn.amount, 0);

  return (
    <Card className="border-amber-200 dark:border-amber-800">
      <CardHeader title="Debit Note Adjustments" />
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <tr>
              <Th>DN #</Th>
              <Th>Date</Th>
              <Th>Reason</Th>
              <Th align="right">Amount</Th>
              <Th>Status</Th>
            </tr>
          </TableHeader>
          <TableBody>
            {debitNotes.map((dn: DebitNote) => (
              <TableRow key={dn.id}>
                <TableCell className="font-medium">{dn.debitNoteNumber}</TableCell>
                <TableCell className="text-zinc-500 dark:text-zinc-400">{dn.issueDate}</TableCell>
                <TableCell className="max-w-[250px] truncate text-sm text-zinc-500 dark:text-zinc-400">{dn.reason}</TableCell>
                <TableCell align="right" numeric>
                  <span className="text-red-600 dark:text-red-400">-{formatINR(dn.amount)}</span>
                </TableCell>
                <TableCell>
                  <Badge variant={dn.status === 'adjusted' ? 'success' : 'warning'} className="capitalize">
                    {dn.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {totalAdjusted > 0 && (
          <div className="flex justify-end px-4 py-2 text-sm border-t border-amber-200 dark:border-amber-800">
            <div className="flex w-52 justify-between gap-6">
              <span className="font-medium text-amber-700 dark:text-amber-400">Total Adjusted</span>
              <span className="font-mono font-medium tabular-nums text-red-600 dark:text-red-400">
                -{formatINR(totalAdjusted)}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Bill Info Card ───────────────────────────────────────────────────────────

function BillInfoCard({ invoice }: { invoice: PurchaseInvoiceWithDetails }) {
  const fields = [
    { label: 'Vendor', value: invoice.vendorName },
    { label: 'Invoice Date', value: invoice.invoiceDate },
    { label: 'Due Date', value: invoice.dueDate },
    { label: 'PO Reference', value: invoice.poId ?? '—' },
    { label: 'GRN Reference', value: invoice.grnId ?? '—' },
  ];

  return (
    <Card>
      <CardHeader title="Bill Info" />
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          {fields.map(({ label, value }) => (
            <div key={label}>
              <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</dt>
              <dd className="mt-0.5 text-zinc-900 dark:text-zinc-100">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

// ─── Main Detail Page ─────────────────────────────────────────────────────────

export function BillDetailPage({ billId }: { billId: string }) {
  const { data, isLoading, isError } = usePurchaseInvoice(billId);
  const invoice = data?.data;

  if (isLoading) {
    return (
      <div className="max-w-4xl">
        <div className="mb-6 h-6 w-48 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-800" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !invoice) {
    return (
      <div className="max-w-4xl">
        <p className="text-sm text-red-500">Bill not found.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <PageHeader
        title={invoice.invoiceNumber}
        breadcrumbs={[
          { label: 'AP', href: '/ap' },
          { label: 'Bills', href: '/ap/bills' },
          { label: invoice.invoiceNumber },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant={STATUS_BADGE_VARIANT[invoice.status]}>
              {STATUS_LABELS[invoice.status]}
            </Badge>
            <Badge variant={MATCH_BADGE_VARIANT[invoice.matchStatus]}>
              {invoice.matchStatus.replace('_', ' ')}
            </Badge>
          </div>
        }
      />

      {/* Summary Stats */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        <StatsCard title="Invoice Total" value={invoice.totalAmount} />
        <StatsCard title="Amount Paid" value={invoice.amountPaid} />
        <StatsCard title="Balance Due" value={invoice.balanceDue} />
      </div>

      <div className="flex flex-col gap-4">
        <BillInfoCard invoice={invoice} />
        <LineItemsTable invoice={invoice} />
        <DebitNoteAdjustments invoiceId={invoice.id} />
        <ActionsPanel invoice={invoice} />
      </div>
    </div>
  );
}
