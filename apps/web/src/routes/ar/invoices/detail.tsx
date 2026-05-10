import { useState } from 'react';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  Send, CheckCircle2, AlertTriangle, Bell, Printer, CreditCard, Trash2, ArrowLeft,
  Download, FileMinus, MoreHorizontal, ShieldCheck, History, Mail, Phone, MapPin,
  FileText, Receipt, Plus, QrCode, Eye, FilePlus,
} from 'lucide-react';
import {
  useInvoice, useSendInvoice, useMarkPaid, useMarkPaidFromWallet,
  useInvoiceReceipts, useDeleteInvoice, useHardDeleteInvoice,
} from '@/hooks/queries/use-invoices';
import { useCustomer } from '@/hooks/queries/use-customers';
import type { InvoiceReceipt } from '@/hooks/queries/use-invoices';
import { useAuth } from '@/providers/auth-provider';
import { api } from '@/lib/api-client';
import { formatINR } from '@/lib/utils';
import {
  PageHeader, Button, StatusBadge, Avatar, EmptyState,
  Table, TableHeader, Th, TableBody, TableRow, TableCell,
  formatDate, daysBetween,
} from '@/components/ar/primitives';
import {
  ConfirmationDialog, useToast, Input, DateInput,
} from '@/components/ui';
import { FileUpload } from '@/components/ui/file-upload';

interface Props { invoiceId: string }
interface UPILinkData { deepLink: string; qrData: string }
interface InterestData { principal: number; rate: number; daysOverdue: number; interestAmount: number }

/**
 * Display UOM for an invoice line. Tenants keep the human-friendly pack
 * size in the items-master `unit` field directly ("500ml", "1L"), so
 * prefer that. Falls back to the line's saved uom for ad-hoc lines, then
 * to the GSTN UQC code as a last resort.
 */
function formatLineUom(line: { uom: string | null; itemUnit: string | null; itemPackSizeValue: number | null; itemPackSizeUqc: string | null }): string {
  if (line.itemUnit && line.itemUnit.trim() !== '') return line.itemUnit;
  if (line.uom && line.uom.trim() !== '') return line.uom;
  if (line.itemPackSizeValue && line.itemPackSizeUqc) {
    return line.itemPackSizeValue !== 1 ? `${line.itemPackSizeValue}${line.itemPackSizeUqc}` : line.itemPackSizeUqc;
  }
  return line.itemPackSizeUqc ?? '—';
}

export function InvoiceDetailPage({ invoiceId }: Props) {
  const navigate = useNavigate();
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();

  const { data, isLoading, isError } = useInvoice(invoiceId);
  const invoice = data?.data;
  const { data: receiptsData } = useInvoiceReceipts(invoiceId);
  const receipts: InvoiceReceipt[] = receiptsData?.data ?? [];
  const { data: customerData } = useCustomer(invoice?.customerId ?? '');
  const customer = customerData?.data;

  const sendMutation = useSendInvoice();
  const markPaidMutation = useMarkPaid();
  const markPaidFromWalletMutation = useMarkPaidFromWallet();
  const deleteMutation = useDeleteInvoice();
  const hardDeleteMutation = useHardDeleteInvoice();

  const [upiCopied, setUpiCopied] = useState(false);
  const [showMarkPaid, setShowMarkPaid] = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [referenceNumber, setReferenceNumber] = useState('');

  const { data: upiData } = useQuery({
    queryKey: ['invoices', 'upi-link', invoiceId],
    queryFn: () => api.get<{ data: UPILinkData | null }>(`/ar/invoices/${invoiceId}/upi-link`),
    enabled: !!invoice && invoice.balanceDue > 0,
    retry: false,
  });
  const { data: interestData } = useQuery({
    queryKey: ['invoices', 'interest', invoiceId],
    queryFn: () => api.get<{ data: InterestData }>(`/ar/invoices/${invoiceId}/interest`),
    enabled: !!invoice && invoice.status === 'overdue',
    retry: false,
  });

  function goBack() {
    if (router.history.canGoBack()) router.history.back();
    else navigate({ to: '/ar/invoices' });
  }
  function getPrintUrl(format?: 'pdf') {
    const tenantId = user?.tenantId ?? '';
    const fmt = format ? `&format=${format}` : '';
    return `/api/v1/ar/invoices/${invoiceId}/print?tenantId=${tenantId}${fmt}`;
  }
  function handleSend() {
    sendMutation.mutate({ id: invoiceId, data: { channel: 'email', sendEmail: false } });
  }
  function handleMarkPaid() {
    markPaidMutation.mutate(
      { id: invoiceId, data: { paymentDate, referenceNumber: referenceNumber || undefined } },
      { onSuccess: () => setShowMarkPaid(false) },
    );
  }
  function handleMarkPaidFromWallet() {
    if (!invoice) return;
    markPaidFromWalletMutation.mutate({ id: invoiceId, data: { paymentDate: invoice.invoiceDate } });
  }
  async function handleDiscard() {
    if (!invoice) return;
    try {
      await deleteMutation.mutateAsync(invoice.id);
      toast(`Invoice ${invoice.invoiceNumber} discarded`, 'success');
      setShowDiscard(false);
      navigate({ to: '/ar/invoices' });
    } catch (err) {
      toast((err as Error).message || 'Failed to discard invoice', 'error');
    }
  }
  async function handleHardDelete() {
    if (!invoice) return;
    try {
      await hardDeleteMutation.mutateAsync(invoice.id);
      toast(`Invoice ${invoice.invoiceNumber} deleted`, 'success');
      setShowDelete(false);
      navigate({ to: '/ar/invoices' });
    } catch (err) {
      toast((err as Error).message || 'Failed to delete invoice', 'error');
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-40 animate-pulse rounded-xl border"
            style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
          />
        ))}
      </div>
    );
  }
  if (isError || !invoice) {
    return <p className="text-[13px]" style={{ color: 'var(--neg)' }}>Invoice not found.</p>;
  }

  const isOverdue = invoice.status === 'overdue';
  const isPaid = invoice.status === 'paid';
  const overdueDays = isOverdue ? daysBetween(invoice.dueDate) : 0;
  const paidPct = invoice.totalAmount > 0
    ? ((invoice.totalAmount - invoice.balanceDue) / invoice.totalAmount) * 100
    : 0;

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: 'AR', href: '/ar' },
          { label: 'Invoices', href: '/ar/invoices' },
          { label: invoice.invoiceNumber },
        ]}
        title={invoice.invoiceNumber}
        titleBadge={<StatusBadge status={invoice.status} />}
        actions={
          <>
            <Button variant="ghost" size="sm" icon={<ArrowLeft size={13} />} onClick={goBack}>Back</Button>
            {invoice.status !== 'cancelled' && (
              <>
                <Button variant="outline" size="sm" icon={<Download size={13} />} onClick={() => window.open(getPrintUrl('pdf'), '_blank')}>
                  PDF
                </Button>
                <Button variant="outline" size="sm" icon={<Printer size={13} />} onClick={() => window.open(getPrintUrl(), '_blank')}>
                  Print
                </Button>
              </>
            )}
            {upiData?.data && (
              <Button
                variant="outline"
                size="sm"
                icon={<CreditCard size={13} />}
                onClick={() => {
                  navigator.clipboard.writeText(upiData.data!.deepLink);
                  setUpiCopied(true);
                  setTimeout(() => setUpiCopied(false), 2000);
                }}
              >
                {upiCopied ? 'Copied!' : 'UPI link'}
              </Button>
            )}
            <InvoiceActionButtons
              invoice={invoice}
              sending={sendMutation.isPending}
              walletPending={markPaidFromWalletMutation.isPending}
              onSend={handleSend}
              onMarkPaid={() => setShowMarkPaid(true)}
              onPaidFromWallet={handleMarkPaidFromWallet}
              onEdit={() => navigate({ to: '/ar/invoices/$invoiceId/edit', params: { invoiceId } })}
              onDiscard={() => setShowDiscard(true)}
              onDelete={() => setShowDelete(true)}
            />
            <Button variant="outline" size="sm" icon={<MoreHorizontal size={13} />} />
          </>
        }
      />

      {/* Status banner */}
      {isOverdue && (
        <div
          className="mb-5 flex items-start gap-3 rounded-xl border px-4 py-3"
          style={{
            background: 'var(--neg-soft)',
            borderColor: 'color-mix(in oklab, var(--neg) 30%, transparent)',
          }}
        >
          <AlertTriangle size={16} style={{ color: 'var(--neg)' }} className="mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="text-[13px] font-medium" style={{ color: 'var(--neg)' }}>
              {overdueDays} day{overdueDays === 1 ? '' : 's'} overdue
            </div>
            <div className="mt-0.5 text-[12px]" style={{ color: 'var(--text-2)' }}>
              The due date has passed and payment has not been received.
            </div>
          </div>
          <Button size="sm" icon={<Bell size={13} />}>Send reminder</Button>
          <Button size="sm" variant="outline" icon={<Phone size={13} />}>Log call</Button>
        </div>
      )}
      {isPaid && (
        <div
          className="mb-5 flex items-center gap-3 rounded-xl border px-4 py-3"
          style={{
            background: 'var(--pos-soft)',
            borderColor: 'color-mix(in oklab, var(--pos) 30%, transparent)',
          }}
        >
          <CheckCircle2 size={16} style={{ color: 'var(--pos)' }} className="shrink-0" />
          <div className="text-[13px] font-medium" style={{ color: 'var(--pos)' }}>Fully paid</div>
          {receipts[0] && (
            <div className="text-[12px]" style={{ color: 'var(--text-2)' }}>
              Cleared {formatDate(receipts[0].receiptDate)} · {receipts[0].referenceNumber ?? receipts[0].paymentMethod.replace(/_/g, ' ')}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Left: invoice document + receipts/timeline */}
        <div className="space-y-4 lg:col-span-2">
          {/* Invoice document */}
          <div
            className="overflow-hidden rounded-xl border"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <div className="flex items-start justify-between border-b px-6 py-5" style={{ borderColor: 'var(--border-soft)' }}>
              <div>
                <div className="text-[10.5px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
                  Tax invoice
                </div>
                <div className="num mt-0.5 text-[18px] font-semibold" style={{ color: 'var(--text-1)' }}>
                  {invoice.invoiceNumber}
                </div>
                {invoice.poNumber && (
                  <div className="mt-0.5 text-[11px]" style={{ color: 'var(--text-3)' }}>
                    PO: <span className="num" style={{ color: 'var(--text-2)' }}>{invoice.poNumber}</span>
                  </div>
                )}
              </div>
              <div className="text-right">
                <div className="text-[12px] font-semibold" style={{ color: 'var(--text-1)' }}>
                  runQ
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6 border-b px-6 py-4" style={{ borderColor: 'var(--border-soft)' }}>
              <div>
                <div className="mb-1.5 text-[10.5px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
                  Bill to
                </div>
                <div className="text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>{invoice.customerName}</div>
                {customer?.addressLine1 && (
                  <div className="mt-0.5 text-[11.5px]" style={{ color: 'var(--text-2)' }}>{customer.addressLine1}</div>
                )}
                {customer?.addressLine2 && (
                  <div className="text-[11.5px]" style={{ color: 'var(--text-2)' }}>{customer.addressLine2}</div>
                )}
                {(customer?.city || customer?.state) && (
                  <div className="text-[11.5px]" style={{ color: 'var(--text-2)' }}>
                    {[customer?.city, customer?.state, customer?.pincode].filter(Boolean).join(', ')}
                  </div>
                )}
                {customer?.gstin && (
                  <div className="num mt-1 text-[10.5px]" style={{ color: 'var(--text-3)' }}>
                    GSTIN: {customer.gstin}
                  </div>
                )}
                {customer?.pan && (
                  <div className="num text-[10.5px]" style={{ color: 'var(--text-3)' }}>
                    PAN: {customer.pan}
                  </div>
                )}
              </div>
              <div className="space-y-1.5 text-right">
                <div>
                  <div className="text-[10.5px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Issue date</div>
                  <div className="num text-[12.5px]" style={{ color: 'var(--text-1)' }}>{formatDate(invoice.invoiceDate)}</div>
                </div>
                <div>
                  <div className="text-[10.5px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Due date</div>
                  <div className="num text-[12.5px]" style={{ color: 'var(--text-1)' }}>{formatDate(invoice.dueDate)}</div>
                </div>
                {invoice.placeOfSupply && (
                  <div>
                    <div className="text-[10.5px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Place of supply</div>
                    <div className="text-[12.5px]" style={{ color: 'var(--text-1)' }}>{invoice.placeOfSupply}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Line items */}
            {invoice.items.length === 0 ? (
              <EmptyState icon={<FileText size={16} />} title="No line items" description="No items found for this invoice." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr>
                      <Th>#</Th>
                      <Th>Description</Th>
                      <Th>UOM</Th>
                      <Th>HSN</Th>
                      <Th align="right">Qty</Th>
                      <Th align="right">Rate</Th>
                      <Th align="right">Tax</Th>
                      <Th align="right">Amount</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.items.map((item, i) => (
                      <tr
                        key={item.id}
                        className="border-b last:border-b-0"
                        style={{ borderColor: 'var(--border-soft)' }}
                      >
                        <td className="num px-4 py-2.5" style={{ color: 'var(--text-3)' }}>{i + 1}</td>
                        <td className="px-4 py-2.5" style={{ color: 'var(--text-1)' }}>
                          <div>{item.itemName ?? item.description}</div>
                          {item.itemSku && (
                            <div className="num text-[10.5px]" style={{ color: 'var(--text-3)' }}>{item.itemSku}</div>
                          )}
                        </td>
                        <td className="num px-4 py-2.5" style={{ color: 'var(--text-2)' }}>{formatLineUom(item)}</td>
                        <td className="num px-4 py-2.5" style={{ color: 'var(--text-2)' }}>{item.hsnSacCode ?? '—'}</td>
                        <td className="num px-4 py-2.5 text-right" style={{ color: 'var(--text-2)' }}>
                          {item.quantity}
                        </td>
                        <td className="num px-4 py-2.5 text-right" style={{ color: 'var(--text-2)' }}>{formatINR(item.unitPrice)}</td>
                        <td className="num px-4 py-2.5 text-right" style={{ color: 'var(--text-2)' }}>
                          {item.taxRate != null ? `${item.taxRate}%` : '—'}
                        </td>
                        <td className="num px-4 py-2.5 text-right font-medium" style={{ color: 'var(--text-1)' }}>{formatINR(item.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Totals */}
            <div className="flex justify-end border-t px-6 py-4" style={{ borderColor: 'var(--border-soft)' }}>
              <div className="w-72 space-y-1.5">
                <TotalRow label="Subtotal" value={invoice.subtotal} />
                {invoice.cgstAmount > 0 && <TotalRow label="CGST" value={invoice.cgstAmount} />}
                {invoice.sgstAmount > 0 && <TotalRow label="SGST" value={invoice.sgstAmount} />}
                {invoice.igstAmount > 0 && <TotalRow label="IGST" value={invoice.igstAmount} />}
                {invoice.cessAmount > 0 && <TotalRow label="Cess" value={invoice.cessAmount} />}
                <div
                  className="flex justify-between border-t pt-2 text-[14px] font-semibold"
                  style={{ borderColor: 'var(--border-soft)' }}
                >
                  <span style={{ color: 'var(--text-1)' }}>Total</span>
                  <span className="num" style={{ color: 'var(--text-1)' }}>{formatINR(invoice.totalAmount)}</span>
                </div>
                {invoice.balanceDue !== invoice.totalAmount && (
                  <div
                    className="mt-1.5 flex justify-between border-t pt-1.5 text-[13px]"
                    style={{ borderColor: 'var(--border-soft)' }}
                  >
                    <span style={{ color: 'var(--text-2)' }}>Balance due</span>
                    <span
                      className="num font-semibold"
                      style={{ color: invoice.balanceDue === 0 ? 'var(--pos)' : 'var(--neg)' }}
                    >
                      {formatINR(invoice.balanceDue)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Activity timeline */}
          <ActivityTimeline invoice={invoice} receipts={receipts} customer={customer} />

          {/* Receipts table */}
          {receipts.length > 0 && (
            <div
              className="overflow-hidden rounded-xl border"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              <div className="flex items-center gap-2 border-b px-5 py-3" style={{ borderColor: 'var(--border-soft)' }}>
                <Receipt size={14} style={{ color: 'var(--text-2)' }} />
                <h3 className="text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>Receipts</h3>
                <span className="num text-[11px]" style={{ color: 'var(--text-3)' }}>({receipts.length})</span>
              </div>
              <Table>
                <TableHeader>
                  <tr>
                    <Th>Date</Th>
                    <Th>Reference</Th>
                    <Th>Method</Th>
                    <Th align="right">Amount</Th>
                  </tr>
                </TableHeader>
                <TableBody>
                  {receipts.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell numeric style={{ color: 'var(--text-2)' }}>{formatDate(r.receiptDate)}</TableCell>
                      <TableCell numeric style={{ color: 'var(--text-2)' }}>{r.referenceNumber ?? '—'}</TableCell>
                      <TableCell className="capitalize" style={{ color: 'var(--text-2)' }}>
                        {r.paymentMethod.replace(/_/g, ' ')}
                      </TableCell>
                      <TableCell align="right" numeric className="font-semibold" style={{ color: 'var(--pos)' }}>
                        {formatINR(r.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Attachments */}
          <div
            className="rounded-xl border p-4"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <h3 className="mb-3 text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>Attachments</h3>
            <FileUpload entityType="sales_invoice" entityId={invoiceId} />
          </div>
        </div>

        {/* Right rail */}
        <div className="space-y-4">
          {/* Balance card */}
          <div
            className="rounded-xl border p-4"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <div className="text-[10.5px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
              Balance due
            </div>
            <div
              className="num mt-1 text-[28px] font-semibold tabular-nums"
              style={{ color: invoice.balanceDue === 0 ? 'var(--pos)' : 'var(--text-1)' }}
            >
              {formatINR(invoice.balanceDue)}
            </div>
            <div className="num mt-0.5 text-[11px]" style={{ color: 'var(--text-3)' }}>
              of {formatINR(invoice.totalAmount)} total
            </div>
            <div
              className="mt-3 h-1.5 overflow-hidden rounded-full"
              style={{ background: 'var(--surface-2)' }}
            >
              <div
                className="h-full rounded-full"
                style={{ width: `${paidPct.toFixed(1)}%`, background: 'var(--pos)' }}
              />
            </div>
            <div className="num mt-1.5 flex items-center justify-between text-[10.5px]" style={{ color: 'var(--text-3)' }}>
              <span>{paidPct.toFixed(0)}% paid</span>
              <span>{invoice.balanceDue > 0 ? `${formatINR(invoice.balanceDue)} pending` : 'Settled'}</span>
            </div>
          </div>

          {/* Customer mini */}
          {customer && (
            <div
              className="rounded-xl border p-4"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              <div className="mb-2 flex items-center gap-2.5">
                <Avatar name={customer.name} size={32} />
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium" style={{ color: 'var(--text-1)' }}>
                    {customer.name}
                  </div>
                  {customer.contactPerson && (
                    <div className="truncate text-[11px]" style={{ color: 'var(--text-3)' }}>
                      {customer.contactPerson}
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-1.5 text-[11.5px]" style={{ color: 'var(--text-2)' }}>
                {customer.email && (
                  <div className="flex items-center gap-2">
                    <Mail size={11} style={{ color: 'var(--text-3)' }} className="shrink-0" />
                    <span className="truncate">{customer.email}</span>
                  </div>
                )}
                {customer.phone && (
                  <div className="flex items-center gap-2">
                    <Phone size={11} style={{ color: 'var(--text-3)' }} className="shrink-0" />
                    <span className="num">{customer.phone}</span>
                  </div>
                )}
                {(customer.city || customer.state) && (
                  <div className="flex items-center gap-2">
                    <MapPin size={11} style={{ color: 'var(--text-3)' }} className="shrink-0" />
                    <span className="truncate">{[customer.city, customer.state].filter(Boolean).join(', ')}</span>
                  </div>
                )}
              </div>
              <div
                className="mt-3 flex items-center justify-between border-t pt-3"
                style={{ borderColor: 'var(--border-soft)' }}
              >
                <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>Outstanding</span>
                <span className="num text-[12.5px] font-medium" style={{ color: 'var(--text-1)' }}>
                  {formatINR(customer.outstandingAmount ?? 0)}
                </span>
              </div>
              <button
                className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md border py-1.5 text-[11.5px] font-medium hover:bg-[var(--surface-2)]"
                style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
                onClick={() => navigate({ to: '/ar/customers/$customerId', params: { customerId: customer.id } })}
              >
                <Eye size={12} /> View customer
              </button>
            </div>
          )}

          {/* e-Invoice */}
          {invoice.irnNumber && (
            <div
              className="rounded-xl border p-4"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              <div className="mb-2 flex items-center gap-2">
                <ShieldCheck size={14} style={{ color: 'var(--pos)' }} />
                <div className="text-[12px] font-semibold" style={{ color: 'var(--text-1)' }}>
                  e-Invoice generated
                </div>
              </div>
              <div className="space-y-1 text-[11px]" style={{ color: 'var(--text-2)' }}>
                <div>
                  <span style={{ color: 'var(--text-3)' }}>IRN: </span>
                  <span className="num">{invoice.irnNumber.slice(0, 12)}…</span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-3)' }}>Status: </span>
                  <span className="font-medium" style={{ color: 'var(--pos)' }}>Verified by GSTN</span>
                </div>
                {invoice.irnDate && (
                  <div>
                    <span style={{ color: 'var(--text-3)' }}>Generated: </span>
                    {formatDate(invoice.irnDate)}
                  </div>
                )}
              </div>
              <Button size="sm" variant="outline" icon={<QrCode size={12} />} className="mt-3 w-full justify-center">
                View QR / IRN
              </Button>
            </div>
          )}

          {/* Linked documents */}
          <div
            className="rounded-xl border p-4"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <div className="mb-2 text-[12px] font-semibold" style={{ color: 'var(--text-1)' }}>
              Linked documents
            </div>
            <div className="space-y-1.5 text-[11.5px]">
              {receipts.length === 0 ? (
                <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>No linked documents.</div>
              ) : (
                receipts.map((r) => (
                  <div key={r.id} className="flex items-center gap-2" style={{ color: 'var(--text-2)' }}>
                    <Receipt size={12} style={{ color: 'var(--text-3)' }} />
                    <span className="num text-[11px]">{r.referenceNumber ?? r.paymentMethod}</span>
                    <span className="num ml-auto font-medium" style={{ color: 'var(--text-1)' }}>
                      {formatINR(r.amount)}
                    </span>
                  </div>
                ))
              )}
              <button
                className="mt-1.5 flex w-full items-center gap-1.5 border-t pt-1.5 text-[11px] hover:underline"
                style={{ borderColor: 'var(--border-soft)', color: 'var(--accent-text)' }}
                onClick={() => navigate({ to: '/ar/credit-notes/new' })}
              >
                <Plus size={11} /> Issue credit note
              </button>
            </div>
          </div>

          {/* Interest accrued */}
          {interestData?.data && interestData.data.interestAmount > 0 && (
            <div
              className="rounded-xl border p-4"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              <div className="mb-2 text-[12px] font-semibold" style={{ color: 'var(--text-1)' }}>
                Interest accrued
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <div className="uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Principal</div>
                  <div className="num font-medium" style={{ color: 'var(--text-1)' }}>{formatINR(interestData.data.principal)}</div>
                </div>
                <div>
                  <div className="uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Rate</div>
                  <div className="num font-medium" style={{ color: 'var(--text-1)' }}>{interestData.data.rate}%</div>
                </div>
                <div>
                  <div className="uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Days overdue</div>
                  <div className="num font-medium" style={{ color: 'var(--text-1)' }}>{interestData.data.daysOverdue}</div>
                </div>
                <div>
                  <div className="uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Interest</div>
                  <div className="num font-semibold" style={{ color: 'var(--neg)' }}>{formatINR(interestData.data.interestAmount)}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mark Paid modal */}
      {showMarkPaid && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowMarkPaid(false)} />
          <div
            className="relative w-full max-w-sm rounded-xl border p-6 shadow-xl"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <h2 className="mb-4 text-[14px] font-semibold" style={{ color: 'var(--text-1)' }}>
              Mark as paid
            </h2>
            <div className="space-y-4">
              <DateInput label="Payment date" required value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
              <Input
                label="UTR / reference number"
                placeholder="e.g. UTR2604001"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
              />
              <p className="text-[12px]" style={{ color: 'var(--text-2)' }}>
                Amount: <span className="num font-semibold" style={{ color: 'var(--text-1)' }}>{formatINR(invoice.balanceDue)}</span>
              </p>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowMarkPaid(false)}>Cancel</Button>
              <Button size="sm" onClick={handleMarkPaid} loading={markPaidMutation.isPending} disabled={!paymentDate}>
                Confirm payment
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmationDialog
        open={showDiscard}
        onClose={() => setShowDiscard(false)}
        onConfirm={handleDiscard}
        title={`Discard ${invoice.invoiceNumber}?`}
        description="This sets the invoice status to 'cancelled'. Only draft invoices can be discarded. The row stays in the database for audit but will no longer count toward AR or appear in active lists."
        confirmLabel="Discard invoice"
        variant="danger"
        loading={deleteMutation.isPending}
      />

      <ConfirmationDialog
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleHardDelete}
        title={`Permanently delete ${invoice.invoiceNumber}?`}
        description="This cannot be undone. The invoice and all its line items will be removed from the database. The delete will be refused if any payment receipts, credit notes, collection assignments, dunning entries, or GL postings reference this invoice — discard (cancel) it instead in that case."
        confirmLabel="Delete forever"
        variant="danger"
        loading={hardDeleteMutation.isPending}
      />
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-[12.5px]">
      <span style={{ color: 'var(--text-2)' }}>{label}</span>
      <span className="num" style={{ color: 'var(--text-1)' }}>{formatINR(value)}</span>
    </div>
  );
}

function InvoiceActionButtons({
  invoice, sending, walletPending, onSend, onMarkPaid, onPaidFromWallet, onEdit, onDiscard, onDelete,
}: {
  invoice: { status: string; invoiceNumber: string };
  sending: boolean;
  walletPending: boolean;
  onSend: () => void;
  onMarkPaid: () => void;
  onPaidFromWallet: () => void;
  onEdit: () => void;
  onDiscard: () => void;
  onDelete: () => void;
}) {
  if (invoice.status === 'draft') {
    return (
      <>
        <Button size="sm" icon={<Send size={13} />} onClick={onSend} loading={sending}>Send</Button>
        <Button variant="outline" size="sm" onClick={onEdit}>Edit</Button>
        <Button variant="outline" size="sm" icon={<Trash2 size={13} />} onClick={onDiscard}>Discard</Button>
        <Button variant="outline" size="sm" icon={<Trash2 size={13} />} onClick={onDelete} />
      </>
    );
  }
  if (invoice.status === 'cancelled') {
    return <Button variant="outline" size="sm" icon={<Trash2 size={13} />} onClick={onDelete}>Delete</Button>;
  }
  if (invoice.status === 'sent' || invoice.status === 'partially_paid') {
    return (
      <>
        <Button size="sm" icon={<CheckCircle2 size={13} />} onClick={onMarkPaid}>Mark paid</Button>
        <Button variant="outline" size="sm" icon={<CheckCircle2 size={13} />} onClick={onPaidFromWallet} loading={walletPending}>
          From wallet
        </Button>
        <Button variant="outline" size="sm" icon={<FileMinus size={13} />}>Credit note</Button>
      </>
    );
  }
  if (invoice.status === 'overdue') {
    return (
      <>
        <Button size="sm" icon={<CheckCircle2 size={13} />} onClick={onMarkPaid}>Mark paid</Button>
        <Button variant="outline" size="sm" icon={<FileMinus size={13} />}>Credit note</Button>
      </>
    );
  }
  return null;
}

function ActivityTimeline({
  invoice, receipts, customer,
}: {
  invoice: { invoiceDate: string; dueDate: string; status: string; irnNumber: string | null; irnDate: string | null };
  receipts: InvoiceReceipt[];
  customer: { email: string | null } | undefined;
}) {
  const events: { at: string; icon: any; title: string; detail?: string; tone: 'pos' | 'warn' | 'accent' }[] = [];
  events.push({ at: invoice.invoiceDate, icon: FilePlus, title: 'Invoice created', tone: 'accent' });
  if (invoice.irnNumber) {
    events.push({
      at: invoice.irnDate ?? invoice.invoiceDate,
      icon: ShieldCheck,
      title: 'e-Invoice generated',
      detail: `IRN ${invoice.irnNumber.slice(0, 12)}… · Verified by GSTN`,
      tone: 'pos',
    });
  }
  if (invoice.status !== 'draft') {
    events.push({
      at: invoice.invoiceDate,
      icon: Send,
      title: 'Sent to customer',
      detail: customer?.email ?? undefined,
      tone: 'accent',
    });
  }
  if (invoice.status === 'overdue') {
    events.push({
      at: invoice.dueDate,
      icon: Bell,
      title: 'Auto-reminder sent',
      detail: 'Dunning rule triggered after due date',
      tone: 'warn',
    });
  }
  receipts.forEach((r) => {
    events.push({
      at: r.receiptDate,
      icon: Receipt,
      title: `Payment received — ${formatINR(r.amount)}`,
      detail: `${r.paymentMethod.replace(/_/g, ' ')}${r.referenceNumber ? ` · ${r.referenceNumber}` : ''}`,
      tone: 'pos',
    });
  });
  events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  const toneFg: Record<typeof events[number]['tone'], string> = {
    pos: 'var(--pos)',
    warn: 'var(--warn)',
    accent: 'var(--accent-text)',
  };

  return (
    <div
      className="overflow-hidden rounded-xl border"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <div className="flex items-center gap-2 border-b px-5 py-3" style={{ borderColor: 'var(--border-soft)' }}>
        <History size={14} style={{ color: 'var(--text-2)' }} />
        <h3 className="text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>Activity</h3>
      </div>
      <div className="px-5 py-4">
        <ol className="relative ml-2 space-y-4 border-l" style={{ borderColor: 'var(--border)' }}>
          {events.map((e, i) => {
            const Icon = e.icon;
            return (
              <li key={i} className="relative ml-4">
                <span
                  className="absolute -left-[24px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full border"
                  style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                >
                  <Icon size={9} style={{ color: toneFg[e.tone] }} />
                </span>
                <div className="flex items-baseline justify-between gap-2">
                  <div className="text-[12.5px] font-medium" style={{ color: 'var(--text-1)' }}>{e.title}</div>
                  <div className="num shrink-0 text-[10.5px]" style={{ color: 'var(--text-3)' }}>{formatDate(e.at)}</div>
                </div>
                {e.detail && (
                  <div className="mt-0.5 text-[11.5px]" style={{ color: 'var(--text-3)' }}>{e.detail}</div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
