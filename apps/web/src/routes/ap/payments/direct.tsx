import { useNavigate } from '@tanstack/react-router';
import { DirectPaymentForm } from '../../../components/forms/direct-payment-form';
import { useCreateDirectPayment } from '../../../hooks/queries/use-payments';
import { useToast } from '@/components/ui';
import type { CreateDirectPaymentInput } from '@runq/validators';
import { PageHeader } from '@/components/ui';

export function DirectPaymentPage() {
  const navigate = useNavigate();
  const mutation = useCreateDirectPayment();
  const { toast } = useToast();

  function handleSubmit(data: CreateDirectPaymentInput) {
    mutation.mutate(data, {
      onSuccess: () => {
        toast('Direct payment recorded successfully.', 'success');
        navigate({ to: '/ap/payments' });
      },
      onError: () => {
        toast('Failed to record payment. Please check your inputs and try again.', 'error');
      },
    });
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Direct Payment"
        description="Record a payment directly without linking to an invoice."
        breadcrumbs={[
          { label: 'AP', href: '/ap' },
          { label: 'Payments', href: '/ap/payments' },
          { label: 'Direct Payment' },
        ]}
      />
      <DirectPaymentForm onSubmit={handleSubmit} isLoading={mutation.isPending} />
    </div>
  );
}
