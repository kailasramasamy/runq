import { useNavigate } from '@tanstack/react-router';
import { Send, CheckCircle, AlertTriangle, Bell } from 'lucide-react';
import { useInvoice, useSendInvoice, useMarkPaid } from '@/hooks/queries/use-invoices';
import { formatINR } from '@/lib/utils';
import type { SalesInvoiceStatus } from '@runq/types';
import {
  PageHeader, Badge, Button, Card, CardHeader, CardContent,
  StatsCard, EmptyState, CardSkeleton,
  Table, TableHeader, Th, TableBody, TableRow, TableCell,
} from '@/components/ui';
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

export function InvoiceDetailPage({ invoiceId }: Props) {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useInvoice(invoiceId);
  const sendMutation = useSendInvoice();
  const markPaidMutation = useMarkPaid();
  const invoice = data?.data;

  function handleSend() {
    sendMutation.mutate({ id: invoiceId, data: { sendEmail: false } });
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
    <div className="max-w-3xl">
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
            </div>
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
                    <Th align="right">Qty</Th>
                    <Th align="right">Unit Price</Th>
                    <Th align="right">Amount</Th>
                  </tr>
                </TableHeader>
                <TableBody>
                  {invoice.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.description}</TableCell>
                      <TableCell numeric>{item.quantity}</TableCell>
                      <TableCell numeric>{formatINR(item.unitPrice)}</TableCell>
                      <TableCell numeric>{formatINR(item.amount)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell colSpan={3} className="text-right text-sm text-zinc-500 dark:text-zinc-400">
                      Subtotal
                    </TableCell>
                    <TableCell numeric className="font-mono">{formatINR(invoice.subtotal)}</TableCell>
                  </TableRow>
                  {invoice.taxAmount > 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-right text-sm text-zinc-500 dark:text-zinc-400">
                        Tax
                      </TableCell>
                      <TableCell numeric className="font-mono">{formatINR(invoice.taxAmount)}</TableCell>
                    </TableRow>
                  )}
                  <TableRow>
                    <TableCell colSpan={3} className="text-right text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      Total
                    </TableCell>
                    <TableCell numeric className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                      {formatINR(invoice.totalAmount)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {(invoice.status === 'partially_paid' || invoice.status === 'paid') && (
          <Card>
            <CardHeader title="Receipt History" />
            <CardContent>
              <EmptyState
                icon={FileText}
                title="No receipts recorded"
                description="Receipts against this invoice will appear here."
              />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
