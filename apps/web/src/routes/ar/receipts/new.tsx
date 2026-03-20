import { useNavigate } from '@tanstack/react-router';
import { ReceiptForm } from '../../../components/forms/receipt-form';
import { useCreateReceipt } from '../../../hooks/queries/use-receipts';
import { useToast, PageHeader } from '@/components/ui';
import type { CreateReceiptInput } from '@runq/validators';

export function NewReceiptPage() {
  const navigate = useNavigate();
  const mutation = useCreateReceipt();
  const { toast } = useToast();

  function handleSubmit(data: CreateReceiptInput) {
    mutation.mutate(data, {
      onSuccess: () => {
        toast('Receipt recorded successfully.', 'success');
        navigate({ to: '/ar/receipts' });
      },
      onError: () => {
        toast('Failed to record receipt. Please check your inputs and try again.', 'error');
      },
    });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Record Receipt"
        description="Record a payment received from a customer against their invoices."
        breadcrumbs={[
          { label: 'AR', href: '/ar' },
          { label: 'Receipts', href: '/ar/receipts' },
          { label: 'Record Receipt' },
        ]}
      />
      <ReceiptForm onSubmit={handleSubmit} isLoading={mutation.isPending} />
    </div>
  );
}
