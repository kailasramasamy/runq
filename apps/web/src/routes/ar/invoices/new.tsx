import { useNavigate } from '@tanstack/react-router';
import { InvoiceForm } from '@/components/forms/invoice-form';
import { useCreateInvoice } from '@/hooks/queries/use-invoices';
import { useToast, PageHeader } from '@/components/ui';
import type { CreateSalesInvoiceInput } from '@runq/validators';

export function NewInvoicePage() {
  const navigate = useNavigate();
  const mutation = useCreateInvoice();
  const { toast } = useToast();

  function handleSubmit(data: CreateSalesInvoiceInput) {
    mutation.mutate(data, {
      onSuccess: () => {
        toast('Invoice created successfully', 'success');
        navigate({ to: '/ar/invoices' });
      },
      onError: () => {
        toast('Failed to create invoice. Please try again.', 'error');
      },
    });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        breadcrumbs={[
          { label: 'AR', href: '/ar' },
          { label: 'Invoices', href: '/ar/invoices' },
          { label: 'New Invoice' },
        ]}
        title="New Invoice"
        description="Create a sales invoice for a customer."
      />
      <InvoiceForm onSubmit={handleSubmit} isLoading={mutation.isPending} />
    </div>
  );
}
