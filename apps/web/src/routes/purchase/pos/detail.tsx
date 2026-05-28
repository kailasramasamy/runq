import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Pencil, Send, XCircle, Archive, Truck, Download, MessageCircle } from 'lucide-react';
import {
  PageHeader, Button, Card, CardHeader, CardContent, CardSkeleton,
  Table, TableHeader, TableBody, TableRow, TableCell, Th,
  Modal, ConfirmationDialog, useToast,
} from '@/components/ui';
import { Link } from '@tanstack/react-router';
import {
  usePurchaseOrder,
  useSendPurchaseOrder,
  useClosePurchaseOrder,
  useCancelPurchaseOrder,
  usePoLinkedDocuments,
} from '@/hooks/queries/use-purchase-orders';
import { formatINR } from '@/lib/utils';

interface Props { poId: string }

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', sent: 'Sent', partially_received: 'Partial',
  received: 'Received', closed: 'Closed', cancelled: 'Cancelled',
};
const STATUS_COLOR: Record<string, { bg: string; fg: string }> = {
  draft:              { bg: 'var(--surface-2)',                fg: 'var(--text-2)' },
  sent:               { bg: 'rgba(37, 99, 235, 0.10)',         fg: '#2563eb' },
  partially_received: { bg: 'rgba(234, 88, 12, 0.10)',         fg: '#ea580c' },
  received:           { bg: 'rgba(22, 163, 74, 0.10)',         fg: '#16a34a' },
  closed:             { bg: 'rgba(124, 58, 237, 0.10)',        fg: '#6d28d9' },
  cancelled:          { bg: 'rgba(220, 38, 38, 0.10)',         fg: '#dc2626' },
};

export function PurchaseOrderDetailPage({ poId }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data, isLoading, isError } = usePurchaseOrder(poId);
  const { data: linkedRes } = usePoLinkedDocuments(poId);
  const sendM = useSendPurchaseOrder();
  const closeM = useClosePurchaseOrder();
  const cancelM = useCancelPurchaseOrder();

  const [showClose, setShowClose] = useState(false);
  const [closeReason, setCloseReason] = useState('');
  const [showCancel, setShowCancel] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [showShareMsg, setShowShareMsg] = useState(false);
  const [copied, setCopied] = useState(false);

  const po = data?.data;

  if (isLoading) {
    return (
      <div className="max-w-5xl space-y-4">
        <CardSkeleton /><CardSkeleton />
      </div>
    );
  }
  if (isError || !po) return <p className="text-sm text-red-500">PO not found.</p>;

  const tone = STATUS_COLOR[po.status] ?? STATUS_COLOR.draft!;
  const canEdit = po.status === 'draft';
  const canSend = po.status === 'draft' && po.lines.length > 0;
  const canReceive = ['sent', 'partially_received'].includes(po.status);
  const canClose = ['sent', 'partially_received', 'received'].includes(po.status);
  const canCancel = !['cancelled', 'closed'].includes(po.status);
  const canDownload = po.status !== 'draft' && po.status !== 'cancelled';
  const canWhatsApp = po.status !== 'cancelled' && po.lines.length > 0;

  async function downloadPdf() {
    if (downloading) return;
    setDownloading(true);
    try {
      const token = localStorage.getItem('runq-token');
      const res = await fetch(`/api/v1/purchase/pos/${poId}/pdf?format=pdf`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Could not generate PO PDF');
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const match = /filename="?([^";]+)"?/i.exec(disposition);
      const fileName = match?.[1] ?? `${po?.poNumber ?? poId}.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      toast((e as Error).message || 'Failed to download PDF', 'error');
    } finally {
      setDownloading(false);
    }
  }

  /// Vendor-addressed message listing each PO line (name + qty). No
  /// pricing — recipient should ask for the PDF if they need amounts.
  /// Surfaced in a copy-to-clipboard modal so the user pastes it into
  /// the channel of their choice (WhatsApp, email, etc.) themselves.
  const shareMessage = po
    ? (() => {
        const out: string[] = [];
        out.push(`Hello ${po.vendorName},`);
        out.push('');
        out.push(`Please find Purchase Order ${po.poNumber} dated ${po.poDate}.`);
        if (po.expectedDate) out.push(`Expected delivery: ${po.expectedDate}.`);
        out.push('');
        out.push('Items:');
        po.lines.forEach((l, i) => {
          const qty = formatQty(Number(l.qtyOrdered));
          const uom = (l.uom ?? '').trim();
          const qtyLabel = uom ? `${qty} ${uom}` : qty;
          out.push(`${i + 1}. ${l.description} — ${qtyLabel}`);
        });
        if (po.paymentTerms) {
          out.push('');
          out.push(`Payment terms: ${po.paymentTerms}`);
        }
        out.push('');
        out.push('Please confirm receipt of this PO.');
        return out.join('\n');
      })()
    : '';

  async function copyShareMessage() {
    try {
      await navigator.clipboard.writeText(shareMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast('Copy failed — select and copy manually', 'error');
    }
  }

  function handleSend() {
    sendM.mutate(poId, {
      onSuccess: () => {
        toast('PO sent — downloading PDF to share', 'success');
        // One-tap-after-send: trigger the download so the user can attach it
        // to WhatsApp/email without a second click.
        void downloadPdf();
      },
      onError: (err) => toast((err as Error).message || 'Failed to send', 'error'),
    });
  }

  function handleClose() {
    if (!closeReason.trim()) {
      toast('A short-close reason is required', 'error');
      return;
    }
    closeM.mutate(
      { id: poId, data: { reason: closeReason.trim() } },
      {
        onSuccess: () => { toast('PO closed', 'success'); setShowClose(false); setCloseReason(''); },
        onError: (err) => toast((err as Error).message || 'Failed to close', 'error'),
      },
    );
  }

  function handleCancel() {
    cancelM.mutate(
      { id: poId, data: { reason: null } },
      {
        onSuccess: () => { toast('PO cancelled', 'success'); setShowCancel(false); },
        onError: (err) => toast((err as Error).message || 'Failed to cancel', 'error'),
      },
    );
  }

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: 'Purchase', href: '/purchase' },
          { label: 'Purchase Orders', href: '/purchase/pos' },
          { label: po.poNumber },
        ]}
        title={po.poNumber}
        titleBadge={
          <span
            className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={{ background: tone.bg, color: tone.fg }}
          >
            {STATUS_LABEL[po.status] ?? po.status}
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {canDownload && (
              <Button variant="outline" size="sm" onClick={downloadPdf} loading={downloading}>
                <Download size={13} className="mr-1" /> PDF
              </Button>
            )}
            {canWhatsApp && (
              <Button variant="outline" size="sm" onClick={() => setShowShareMsg(true)}>
                <MessageCircle size={13} className="mr-1" /> WhatsApp
              </Button>
            )}
            {canEdit && (
              <Button
                variant="outline" size="sm"
                onClick={() => navigate({ to: '/purchase/pos/$poId/edit', params: { poId } })}
              >
                <Pencil size={13} className="mr-1" /> Edit
              </Button>
            )}
            {canSend && (
              <Button size="sm" onClick={handleSend} loading={sendM.isPending}>
                <Send size={13} className="mr-1" /> Send PO
              </Button>
            )}
            {canReceive && (
              <Button
                size="sm"
                onClick={() => navigate({ to: '/purchase/pos/$poId/receive', params: { poId } })}
              >
                <Truck size={13} className="mr-1" /> Receive
              </Button>
            )}
            {canClose && (
              <Button variant="outline" size="sm" onClick={() => setShowClose(true)}>
                <Archive size={13} className="mr-1" /> Close
              </Button>
            )}
            {canCancel && (
              <Button variant="outline" size="sm" onClick={() => setShowCancel(true)}>
                <XCircle size={13} className="mr-1" /> Cancel
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Header" />
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
                <dt style={{ color: 'var(--text-3)' }}>Vendor</dt>
                <dd className="font-medium" style={{ color: 'var(--text-1)' }}>{po.vendorName}</dd>
                <dt style={{ color: 'var(--text-3)' }}>PO date</dt>
                <dd>{po.poDate}</dd>
                <dt style={{ color: 'var(--text-3)' }}>Expected delivery</dt>
                <dd>{po.expectedDate ?? '—'}</dd>
                <dt style={{ color: 'var(--text-3)' }}>Payment terms</dt>
                <dd>{po.paymentTerms ?? '—'}</dd>
                {po.deliveryAddress && (
                  <>
                    <dt style={{ color: 'var(--text-3)' }}>Delivery address</dt>
                    <dd className="whitespace-pre-line">{po.deliveryAddress}</dd>
                  </>
                )}
                {po.notes && (
                  <>
                    <dt style={{ color: 'var(--text-3)' }}>Notes</dt>
                    <dd className="whitespace-pre-line">{po.notes}</dd>
                  </>
                )}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Line items" />
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <tr>
                    <Th>#</Th>
                    <Th>Description</Th>
                    <Th align="right">Qty</Th>
                    <Th align="right">Received</Th>
                    <Th align="right">Rate</Th>
                    <Th align="right">Tax %</Th>
                    <Th align="right">Amount (incl. tax)</Th>
                  </tr>
                </TableHeader>
                <TableBody>
                  {po.lines.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>{l.lineNo}</TableCell>
                      <TableCell>
                        <div>{l.description}</div>
                        {l.hsnSacCode && (
                          <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>HSN {l.hsnSacCode}</div>
                        )}
                      </TableCell>
                      <TableCell align="right" numeric>{l.qtyOrdered}</TableCell>
                      <TableCell align="right" numeric>
                        {l.qtyReceived > 0 ? l.qtyReceived : '—'}
                      </TableCell>
                      <TableCell align="right" numeric>{formatINR(l.unitRate)}</TableCell>
                      <TableCell align="right" numeric>{l.taxRate ?? 0}%</TableCell>
                      <TableCell align="right" numeric>
                        {formatINR(Number(l.amount) + Number(l.taxAmount ?? 0))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Totals" />
            <CardContent>
              <div className="flex flex-col gap-2 text-[13px]">
                <Row label="Subtotal" value={formatINR(po.subtotal)} />
                <Row label="Tax" value={formatINR(po.taxTotal)} />
                <Row label="Total" value={formatINR(po.total)} bold />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Linked documents" />
            <CardContent>
              <LinkedDocumentsBody linked={linkedRes?.data} />
            </CardContent>
          </Card>

          {po.status === 'closed' && po.closedReason && (
            <Card>
              <CardHeader title="Closed reason" />
              <CardContent>
                <p className="text-[12.5px]">{po.closedReason}</p>
                <p className="mt-1 text-[11px]" style={{ color: 'var(--text-3)' }}>
                  Closed {po.closedAt ? new Date(po.closedAt).toLocaleString('en-IN') : ''}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Modal open={showClose} onClose={() => setShowClose(false)} title="Close this PO?">
        <p className="mb-3 text-[12.5px]" style={{ color: 'var(--text-2)' }}>
          Short-closes the PO — no further GRNs or bills can match it. Open quantities stay as committed history.
        </p>
        <label className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
          Reason
        </label>
        <textarea
          value={closeReason}
          onChange={(e) => setCloseReason(e.target.value)}
          className="mt-1 w-full rounded-md border px-3 py-2 text-[13px]"
          style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text-1)' }}
          rows={3}
          placeholder="Short-supply; closing remainder."
        />
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setShowClose(false)}>Cancel</Button>
          <Button onClick={handleClose} loading={closeM.isPending}>Close PO</Button>
        </div>
      </Modal>

      <ConfirmationDialog
        open={showCancel}
        onClose={() => setShowCancel(false)}
        onConfirm={handleCancel}
        title="Cancel this PO?"
        description="The PO will be marked cancelled. History is preserved; no further GRNs or bills can match it."
        confirmLabel="Cancel PO"
        loading={cancelM.isPending}
      />

      <Modal
        open={showShareMsg}
        onClose={() => setShowShareMsg(false)}
        title="Message for vendor"
      >
        <p className="mb-2 text-[12.5px]" style={{ color: 'var(--text-2)' }}>
          Copy this message and paste into WhatsApp, email, or any channel you use with the vendor.
        </p>
        <textarea
          readOnly
          value={shareMessage}
          rows={Math.min(16, Math.max(8, shareMessage.split('\n').length + 1))}
          className="w-full resize-none rounded-md border px-3 py-2 font-mono text-[12.5px] leading-snug"
          style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text-1)' }}
          onFocus={(e) => e.target.select()}
        />
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setShowShareMsg(false)}>Close</Button>
          <Button onClick={copyShareMessage}>
            {copied ? 'Copied ✓' : 'Copy to clipboard'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function LinkedDocumentsBody({ linked }: { linked?: import('@/hooks/queries/use-purchase-orders').PoLinkedDocuments }) {
  if (!linked) return <p className="text-[12px]" style={{ color: 'var(--text-3)' }}>Loading…</p>;
  if (linked.grns.length === 0 && linked.bills.length === 0) {
    return (
      <p className="text-[12px]" style={{ color: 'var(--text-3)' }}>
        No receipts or bills posted against this PO yet.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3 text-[12.5px]">
      {linked.grns.length > 0 && (
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>GRNs</div>
          <ul className="space-y-1">
            {linked.grns.map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-2">
                <span className="font-mono">{g.grnNo}</span>
                <span style={{ color: 'var(--text-3)' }}>
                  {g.receivedDate} · {g.source === 'po_with_bill' ? 'scan' : g.source}
                </span>
                <span className="font-mono tabular-nums">{formatINR(g.totalValue)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {linked.bills.length > 0 && (
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Bills</div>
          <ul className="space-y-1">
            {linked.bills.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-2">
                <Link to="/finance/ap/bills/$billId" params={{ billId: b.id }} className="font-mono hover:underline">
                  {b.invoiceNumber}
                </Link>
                <span style={{ color: 'var(--text-3)' }}>{b.invoiceDate} · {b.status}</span>
                <span className="font-mono tabular-nums">{formatINR(b.totalAmount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span style={{ color: 'var(--text-3)' }}>{label}</span>
      <span
        className={bold ? 'font-mono font-semibold tabular-nums' : 'font-mono tabular-nums'}
        style={{ color: bold ? 'var(--text-1)' : 'var(--text-2)' }}
      >
        {value}
      </span>
    </div>
  );
}

function formatQty(v: number): string {
  if (!Number.isFinite(v)) return '0';
  if (Number.isInteger(v)) return v.toString();
  return v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}
