import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { InvoiceForm } from '../../../components/forms/invoice-form';
import { useInvoice, useUpdateInvoice, useUpdateInvoiceHsn } from '../../../hooks/queries/use-invoices';
import { PageHeader, useToast, CardSkeleton, Card, CardHeader, CardContent, Button, HsnSacCombobox } from '@/components/ui';
import type { CreateSalesInvoiceInput } from '@runq/validators';
import type { SalesInvoiceWithDetails } from '@runq/types';

interface Props { invoiceId: string }

export function EditInvoicePage({ invoiceId }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data, isLoading, isError } = useInvoice(invoiceId);
  const mutation = useUpdateInvoice();
  const invoice = data?.data;

  function handleSubmit(formData: CreateSalesInvoiceInput) {
    mutation.mutate(
      { id: invoiceId, data: formData },
      {
        onSuccess: () => {
          toast('Invoice updated successfully.', 'success');
          navigate({ to: '/ar/invoices/$invoiceId', params: { invoiceId } });
        },
        onError: () => {
          toast('Failed to update invoice. Please check your inputs and try again.', 'error');
        },
      },
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-4xl space-y-4">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (isError || !invoice) {
    return <p className="text-sm text-red-500">Invoice not found.</p>;
  }

  if (invoice.status === 'cancelled') {
    return (
      <div className="max-w-2xl">
        <PageHeader
          title="Cannot edit invoice"
          breadcrumbs={[
            { label: 'AR', href: '/ar' },
            { label: 'Invoices', href: '/ar/invoices' },
            { label: invoice.invoiceNumber },
          ]}
        />
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-400">
          This invoice is cancelled and cannot be edited.
        </div>
      </div>
    );
  }

  if (invoice.status !== 'draft') {
    return <HsnOnlyEditor invoiceId={invoiceId} invoice={invoice} />;
  }

  return (
    <div className="max-w-7xl">
      <PageHeader
        title={`Edit ${invoice.invoiceNumber}`}
        description="Editing a draft invoice. Once sent, only HSN/SAC can be updated — financial fields require a credit note."
        breadcrumbs={[
          { label: 'AR', href: '/ar' },
          { label: 'Invoices', href: '/ar/invoices' },
          { label: invoice.invoiceNumber, href: `/ar/invoices/${invoiceId}` },
          { label: 'Edit' },
        ]}
      />
      <InvoiceForm
        initialData={invoice}
        onSubmit={handleSubmit}
        onCancel={() => navigate({ to: '/ar/invoices/$invoiceId', params: { invoiceId } })}
        isLoading={mutation.isPending}
        submitLabel="Save Changes"
      />
    </div>
  );
}

function HsnOnlyEditor({ invoiceId, invoice }: { invoiceId: string; invoice: SalesInvoiceWithDetails }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const mutation = useUpdateInvoiceHsn();
  const [hsnByItem, setHsnByItem] = useState<Record<string, string>>(() =>
    Object.fromEntries(invoice.items.map((it) => [it.id, it.hsnSacCode ?? ''])),
  );

  function setHsn(itemId: string, code: string) {
    setHsnByItem((prev) => ({ ...prev, [itemId]: code }));
  }

  function handleSave() {
    const changed = invoice.items
      .filter((it) => (hsnByItem[it.id] ?? '') !== (it.hsnSacCode ?? '') && (hsnByItem[it.id] ?? '').trim() !== '')
      .map((it) => ({ id: it.id, hsnSacCode: hsnByItem[it.id]!.trim() }));

    if (changed.length === 0) {
      toast('No HSN changes to save.', 'info');
      return;
    }

    mutation.mutate(
      { id: invoiceId, items: changed },
      {
        onSuccess: () => {
          toast(`Updated HSN on ${changed.length} line${changed.length > 1 ? 's' : ''}.`, 'success');
          navigate({ to: '/ar/invoices/$invoiceId', params: { invoiceId } });
        },
        onError: () => toast('Failed to update HSN. Try again.', 'error'),
      },
    );
  }

  return (
    <div className="max-w-4xl">
      <PageHeader
        title={`Update HSN — ${invoice.invoiceNumber}`}
        description="This invoice is already issued. Only HSN/SAC codes can be changed (no financial fields). Used to fix GSTR-1 readiness on paid invoices without issuing a credit note."
        breadcrumbs={[
          { label: 'AR', href: '/ar' },
          { label: 'Invoices', href: '/ar/invoices' },
          { label: invoice.invoiceNumber, href: `/ar/invoices/${invoiceId}` },
          { label: 'Update HSN' },
        ]}
      />

      <Card>
        <CardHeader>
          <h3 className="text-sm font-medium">Line items</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Status: <span className="font-medium">{invoice.status}</span> · Total ₹{Number(invoice.totalAmount).toLocaleString('en-IN')}
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {invoice.items.map((it) => (
              <div key={it.id} className="grid grid-cols-1 gap-3 border-b border-zinc-100 pb-4 last:border-0 last:pb-0 dark:border-zinc-800 sm:grid-cols-[1fr_280px]">
                <div>
                  <div className="text-sm font-medium">{it.description}</div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    Qty {Number(it.quantity)} {it.uom ?? ''} × ₹{Number(it.unitPrice).toLocaleString('en-IN')} = ₹{Number(it.amount).toLocaleString('en-IN')}
                  </div>
                </div>
                <HsnSacCombobox
                  label="HSN/SAC"
                  value={hsnByItem[it.id] ?? ''}
                  onChange={(code) => setHsn(it.id, code)}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 flex items-center justify-end gap-3">
        <Button
          variant="outline"
          onClick={() => navigate({ to: '/ar/invoices/$invoiceId', params: { invoiceId } })}
          disabled={mutation.isPending}
        >
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving…' : 'Save HSN changes'}
        </Button>
      </div>
    </div>
  );
}
