import { useNavigate } from '@tanstack/react-router';
import { CustomerForm } from '@/components/forms/customer-form';
import { useCreateCustomer } from '@/hooks/queries/use-customers';
import { useToast, PageHeader } from '@/components/ui';
import type { CreateCustomerInput } from '@runq/validators';

export function NewCustomerPage() {
  const navigate = useNavigate();
  const mutation = useCreateCustomer();
  const { toast } = useToast();

  function handleSubmit(data: CreateCustomerInput) {
    mutation.mutate(data, {
      onSuccess: () => {
        toast('Customer created successfully', 'success');
        navigate({ to: '/ar/customers' });
      },
      onError: () => {
        toast('Failed to create customer. Please try again.', 'error');
      },
    });
  }

  function handleCancel() {
    navigate({ to: '/ar/customers' });
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        breadcrumbs={[
          { label: 'AR', href: '/ar' },
          { label: 'Customers', href: '/ar/customers' },
          { label: 'New Customer' },
        ]}
        title="New Customer"
        description="Add a new customer to your accounts receivable."
      />
      <CustomerForm
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isLoading={mutation.isPending}
      />
    </div>
  );
}
