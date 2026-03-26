import { useNavigate } from '@tanstack/react-router';
import { BillForm } from '../../../components/forms/bill-form';
import { useCreatePurchaseInvoice } from '../../../hooks/queries/use-purchase-invoices';
import type { CreatePurchaseInvoiceInput } from '@runq/validators';
import { PageHeader } from '@/components/ui';

export function NewBillPage() {
  const navigate = useNavigate();
  const mutation = useCreatePurchaseInvoice();

  function handleSubmit(data: CreatePurchaseInvoiceInput) {
    mutation.mutate(data, {
      onSuccess: (res) => {
        const id = (res as any)?.data?.id;
        navigate({ to: id ? `/ap/bills/${id}` : '/ap/bills' });
      },
    });
  }

  return (
    <div>
      <PageHeader
        title="New Bill"
        description="Record a vendor bill (purchase invoice)."
        breadcrumbs={[
          { label: 'AP', href: '/ap' },
          { label: 'Bills', href: '/ap/bills' },
          { label: 'New Bill' },
        ]}
      />
      <BillForm onSubmit={handleSubmit} isLoading={mutation.isPending} />
    </div>
  );
}
