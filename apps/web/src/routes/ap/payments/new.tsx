import { useNavigate } from '@tanstack/react-router';
import { PaymentForm } from '../../../components/forms/payment-form';
import { useCreatePayment } from '../../../hooks/queries/use-payments';
import { useToast } from '@/components/ui';
import type { CreateVendorPaymentInput } from '@runq/validators';
import { PageHeader } from '@/components/ui';

export function NewPaymentPage() {
  const navigate = useNavigate();
  const mutation = useCreatePayment();
  const { toast } = useToast();

  function handleSubmit(data: CreateVendorPaymentInput) {
    mutation.mutate(data, {
      onSuccess: () => {
        toast('Payment recorded successfully.', 'success');
        navigate({ to: '/ap/payments' });
      },
      onError: () => {
        toast('Failed to record payment. Please check your inputs and try again.', 'error');
      },
    });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="New Payment"
        description="Record a payment against one or more invoices."
        breadcrumbs={[
          { label: 'AP', href: '/ap' },
          { label: 'Payments', href: '/ap/payments' },
          { label: 'New Payment' },
        ]}
      />
      <PaymentForm onSubmit={handleSubmit} isLoading={mutation.isPending} />
    </div>
  );
}
