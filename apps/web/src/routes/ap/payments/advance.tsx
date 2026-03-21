import { useNavigate } from '@tanstack/react-router';
import { AdvancePaymentForm } from '../../../components/forms/advance-payment-form';
import { useCreateAdvancePayment } from '../../../hooks/queries/use-payments';
import { useToast, PageHeader } from '@/components/ui';
import type { CreateAdvancePaymentInput } from '@runq/validators';

export function AdvancePaymentPage() {
  const navigate = useNavigate();
  const mutation = useCreateAdvancePayment();
  const { toast } = useToast();

  function handleSubmit(data: CreateAdvancePaymentInput) {
    mutation.mutate(data, {
      onSuccess: () => {
        toast('Advance payment recorded successfully.', 'success');
        navigate({ to: '/ap/payments' });
      },
      onError: () => {
        toast('Failed to record advance payment. Please try again.', 'error');
      },
    });
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Advance Payment"
        description="Record an advance payment for a vendor."
        breadcrumbs={[
          { label: 'AP', href: '/ap' },
          { label: 'Payments', href: '/ap/payments' },
          { label: 'Advance Payment' },
        ]}
      />
      <AdvancePaymentForm onSubmit={handleSubmit} isLoading={mutation.isPending} />
    </div>
  );
}
