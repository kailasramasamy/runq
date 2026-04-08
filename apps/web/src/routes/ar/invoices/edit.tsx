import { useNavigate } from '@tanstack/react-router';
import { InvoiceForm } from '../../../components/forms/invoice-form';
import { useInvoice, useUpdateInvoice } from '../../../hooks/queries/use-invoices';
import { PageHeader, useToast, CardSkeleton } from '@/components/ui';
import type { CreateSalesInvoiceInput } from '@runq/validators';

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

  if (invoice.status !== 'draft') {
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
          This invoice is in <strong>{invoice.status}</strong> status and cannot be edited. Issue a credit note to make adjustments.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <PageHeader
        title={`Edit ${invoice.invoiceNumber}`}
        description="Editing a draft invoice. Once sent, it cannot be edited — only adjusted via credit notes."
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
        isLoading={mutation.isPending}
        submitLabel="Save Changes"
      />
    </div>
  );
}
