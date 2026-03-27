import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Send, CheckCircle, AlertTriangle, Bell, Printer, CreditCard, Percent } from 'lucide-react';
import { useInvoice, useSendInvoice, useMarkPaid, useInvoiceReceipts } from '@/hooks/queries/use-invoices';
import type { InvoiceReceipt } from '@/hooks/queries/use-invoices';
import { useAuth } from '@/providers/auth-provider';
import { api } from '@/lib/api-client';
import { formatINR } from '@/lib/utils';
import type { SalesInvoiceStatus } from '@runq/types';
import {
  PageHeader, Badge, Button, Card, CardHeader, CardContent,
  StatsCard, EmptyState, CardSkeleton,
  Table, TableHeader, Th, TableBody, TableRow, TableCell,
} from '@/components/ui';
import { FileUpload } from '@/components/ui/file-upload';
import { FileText } from 'lucide-react';

type BadgeVariant = 'default' | 'info' | 'success' | 'danger' | 'outline' | 'primary' | 'cyan';

const STATUS_BADGE: Record<SalesInvoiceStatus, { variant: BadgeVariant; label: string }> = {
  draft: { variant: 'default', label: 'Draft' },
  sent: { variant: 'info', label: 'Sent' },
  partially_paid: { variant: 'cyan', label: 'Partially Paid' },
  paid: { variant: 'success', label: 'Paid' },
  overdue: { variant: 'danger', label: 'Overdue' },
  cancelled: { variant: 'outline', label: 'Cancelled' },
};

interface Props { invoiceId: string }

interface UPILinkData { deepLink: string; qrData: string }
interface InterestData { principal: number; rate: number; daysOverdue: number; interestAmount: number }

export function InvoiceDetailPage({ invoiceId }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, isLoading, isError } = useInvoice(invoiceId);
  const { data: receiptsData } = useInvoiceReceipts(invoiceId);
  const sendMutation = useSendInvoice();
  const markPaidMutation = useMarkPaid();
  const invoice = data?.data;
  const receipts: InvoiceReceipt[] = receiptsData?.data ?? [];
  const [upiCopied, setUpiCopied] = useState(false);

  const { data: upiData } = useQuery({
    queryKey: ['invoices', 'upi-link', invoiceId],
    queryFn: () => api.get<{ data: UPILinkData }>(`/ar/invoices/${invoiceId}/upi-link`),
    enabled: !!invoice && invoice.balanceDue > 0,
    retry: false,
  });

  const { data: interestData } = useQuery({
    queryKey: ['invoices', 'interest', invoiceId],
    queryFn: () => api.get<{ data: InterestData }>(`/ar/invoices/${invoiceId}/interest`),
    enabled: !!invoice && invoice.status === 'overdue',
    retry: false,
  });

  function getPrintUrl() {
    const tenantId = user?.tenantId ?? '';
    return `/api/v1/ar/invoices/${invoiceId}/print?tenantId=${tenantId}`;
  }

  function handleSend() {
    sendMutation.mutate({ id: invoiceId, data: { channel: 'email', sendEmail: false } });
  }

  function handleMarkPaid() {
    const today = new Date().toISOString().split('T')[0];
    markPaidMutation.mutate({ id: invoiceId, data: { paymentDate: today } });
  }

  if (isLoading) {
    return (
      <div className="max-w-3xl space-y-4">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (isError || !invoice) {
    return <p className="text-sm text-red-500">Invoice not found.</p>;
  }

  const statusInfo = STATUS_BADGE[invoice.status];

  const printUrl = getPrintUrl();

  function PrintButtons() {
    if (invoice!.status === 'cancelled') return null;
    return (
      <>
        <Button variant="outline" size="sm" onClick={() => window.open(printUrl, '_blank')}>
          <Printer size={14} /> Print Invoice
        </Button>
        <Button variant="outline" size="sm" onClick={() => window.open(printUrl, '_blank')}>
          Download PDF
        </Button>
      </>
    );
  }

  function InvoiceActions() {
    if (invoice!.status === 'draft') {
      return (
        <>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSend}
            loading={sendMutation.isPending}
          >
            <Send size={14} /> Send
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate({ to: '/ar/invoices/new' })}
          >
            Edit
          </Button>
        </>
      );
    }
    if (invoice!.status === 'sent') {
      return (
        <>
          <Button
            size="sm"
            onClick={handleMarkPaid}
            loading={markPaidMutation.isPending}
          >
            <CheckCircle size={14} /> Mark as Paid
          </Button>
          <Button variant="outline" size="sm" disabled title="Coming soon">
            Record Receipt
          </Button>
        </>
      );
    }
    if (invoice!.status === 'partially_paid') {
      return (
        <Button variant="outline" size="sm" disabled title="Coming soon">
          Record Receipt
        </Button>
      );
    }
    if (invoice!.status === 'overdue') {
      return (
        <Button variant="outline" size="sm" disabled title="Coming soon">
          <Bell size={14} /> Send Reminder
        </Button>
      );
    }
    return null;
  }

  return (
    <div className="max-w-6xl">
      <PageHeader
        breadcrumbs={[
          { label: 'AR', href: '/ar' },
          { label: 'Invoices', href: '/ar/invoices' },
          { label: invoice.invoiceNumber },
        ]}
        title={invoice.invoiceNumber}
        actions={
          <>
            <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
            <PrintButtons />
            {upiData?.data && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(upiData.data.deepLink);
                  setUpiCopied(true);
                  setTimeout(() => setUpiCopied(false), 2000);
                }}
              >
                <CreditCard size={14} /> {upiCopied ? 'Copied!' : 'UPI Payment Link'}
              </Button>
            )}
            <InvoiceActions />
          </>
        }
      />

      {invoice.status === 'overdue' && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-400">
          <AlertTriangle size={16} className="shrink-0" />
          <span>This invoice is overdue. The due date has passed and payment has not been received.</span>
        </div>
      )}

      <div className="mb-6 grid grid-cols-3 gap-4">
        <StatsCard title="Total Amount" value={invoice.totalAmount} formatValue={formatINR} />
        <StatsCard title="Amount Received" value={invoice.amountReceived} formatValue={formatINR} />
        <StatsCard title="Balance Due" value={invoice.balanceDue} formatValue={formatINR} />
      </div>

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader title="Invoice Details" />
          <CardContent className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                Invoice Number
              </p>
              <p className="mt-0.5 font-mono text-base font-semibold text-zinc-900 dark:text-zinc-100">
                {invoice.invoiceNumber}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                Customer
              </p>
              <p className="mt-0.5 text-sm text-zinc-900 dark:text-zinc-100">{invoice.customerName}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                Invoice Date
              </p>
              <p className="mt-0.5 text-sm text-zinc-900 dark:text-zinc-100">{invoice.invoiceDate}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                Due Date
              </p>
              <p className="mt-0.5 text-sm text-zinc-900 dark:text-zinc-100">{invoice.dueDate}</p>
              {invoice.discountPercent != null && invoice.discountDays != null && (
                <p className="mt-0.5 text-xs text-emerald-600 dark:text-emerald-400">
                  Discount: {invoice.discountPercent}% if paid within {invoice.discountDays} days
                </p>
              )}
            </div>
            {invoice.placeOfSupply && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                  Place of Supply
                </p>
                <p className="mt-0.5 text-sm text-zinc-900 dark:text-zinc-100">
                  {invoice.placeOfSupply} ({invoice.placeOfSupplyCode})
                </p>
              </div>
            )}
            {invoice.isInterState != null && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                  Supply Type
                </p>
                <p className="mt-0.5 text-sm text-zinc-900 dark:text-zinc-100">
                  {invoice.isInterState ? 'Inter-State' : 'Intra-State'}
                </p>
              </div>
            )}
            {invoice.notes && (
              <div className="col-span-2">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                  Notes
                </p>
                <p className="mt-0.5 text-sm text-zinc-900 dark:text-zinc-100">{invoice.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Line Items" />
          <CardContent className="p-0">
            {invoice.items.length === 0 ? (
              <div className="p-4">
                <EmptyState icon={FileText} title="No line items" description="No items found for this invoice." />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <tr>
                    <Th>Description</Th>
                    <Th>HSN/SAC</Th>
                    <Th>Qty</Th>
                    <Th align="right">Unit Price</Th>
                    <Th align="right">Amount</Th>
                    <Th align="right">Tax Rate</Th>
                    <Th align="right">Tax Amount</Th>
                  </tr>
                </TableHeader>
                <TableBody>
                  {invoice.items.map((item) => {
                    const itemTax = item.cgstAmount + item.sgstAmount + item.igstAmount + item.cessAmount;
                    return (
                      <TableRow key={item.id}>
                        <TableCell>{item.description}</TableCell>
                        <TableCell className="font-mono text-xs">{item.hsnSacCode ?? '—'}</TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell align="right" numeric>{formatINR(item.unitPrice)}</TableCell>
                        <TableCell align="right" numeric>{formatINR(item.amount)}</TableCell>
                        <TableCell align="right" numeric>{item.taxRate != null ? `${item.taxRate}%` : '—'}</TableCell>
                        <TableCell align="right" numeric>{formatINR(itemTax)}</TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow>
                    <TableCell colSpan={6} align="right" className="text-sm text-zinc-500 dark:text-zinc-400">
                      Subtotal
                    </TableCell>
                    <TableCell align="right" numeric className="font-mono">{formatINR(invoice.subtotal)}</TableCell>
                  </TableRow>
                  {invoice.cgstAmount > 0 && (
                    <TableRow>
                      <TableCell colSpan={6} align="right" className="text-sm text-zinc-500 dark:text-zinc-400">
                        CGST
                      </TableCell>
                      <TableCell align="right" numeric className="font-mono">{formatINR(invoice.cgstAmount)}</TableCell>
                    </TableRow>
                  )}
                  {invoice.sgstAmount > 0 && (
                    <TableRow>
                      <TableCell colSpan={6} align="right" className="text-sm text-zinc-500 dark:text-zinc-400">
                        SGST
                      </TableCell>
                      <TableCell align="right" numeric className="font-mono">{formatINR(invoice.sgstAmount)}</TableCell>
                    </TableRow>
                  )}
                  {invoice.igstAmount > 0 && (
                    <TableRow>
                      <TableCell colSpan={6} align="right" className="text-sm text-zinc-500 dark:text-zinc-400">
                        IGST
                      </TableCell>
                      <TableCell align="right" numeric className="font-mono">{formatINR(invoice.igstAmount)}</TableCell>
                    </TableRow>
                  )}
                  {invoice.cessAmount > 0 && (
                    <TableRow>
                      <TableCell colSpan={6} align="right" className="text-sm text-zinc-500 dark:text-zinc-400">
                        Cess
                      </TableCell>
                      <TableCell align="right" numeric className="font-mono">{formatINR(invoice.cessAmount)}</TableCell>
                    </TableRow>
                  )}
                  <TableRow>
                    <TableCell colSpan={6} align="right" className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      Total
                    </TableCell>
                    <TableCell align="right" numeric className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                      {formatINR(invoice.totalAmount)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {receipts.length > 0 && (
          <Card>
            <CardHeader title="Receipt History" />
            <CardContent className="p-0">
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
                      <TableCell>{r.receiptDate}</TableCell>
                      <TableCell className="font-mono text-xs">{r.referenceNumber ?? '—'}</TableCell>
                      <TableCell className="capitalize">{r.paymentMethod.replace(/_/g, ' ')}</TableCell>
                      <TableCell align="right" numeric className="text-emerald-600 dark:text-emerald-400 font-medium">
                        {formatINR(r.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {interestData?.data && interestData.data.interestAmount > 0 && (
          <Card>
            <CardHeader title="Interest Accrued" />
            <CardContent className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                  Principal
                </p>
                <p className="mt-0.5 font-mono text-sm text-zinc-900 dark:text-zinc-100">
                  {formatINR(interestData.data.principal)}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                  Annual Rate
                </p>
                <p className="mt-0.5 font-mono text-sm text-zinc-900 dark:text-zinc-100">
                  {interestData.data.rate}%
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                  Days Overdue
                </p>
                <p className="mt-0.5 font-mono text-sm text-zinc-900 dark:text-zinc-100">
                  {interestData.data.daysOverdue}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                  Interest Amount
                </p>
                <p className="mt-0.5 font-mono text-sm font-semibold text-red-600 dark:text-red-400">
                  {formatINR(interestData.data.interestAmount)}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader title="Attachments" />
          <CardContent>
            <FileUpload entityType="sales_invoice" entityId={invoiceId} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
