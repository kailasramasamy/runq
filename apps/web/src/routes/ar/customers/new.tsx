import { useNavigate, useSearch } from '@tanstack/react-router';
import { CustomerForm } from '@/components/forms/customer-form';
import { useCreateCustomer } from '@/hooks/queries/use-customers';
import { useUpdateQuote } from '@/hooks/queries/use-quotes';
import { useToast, PageHeader } from '@/components/ui';
import type { CreateCustomerInput } from '@runq/validators';
import type { Customer } from '@runq/types';

export function NewCustomerPage() {
  const navigate = useNavigate();
  const mutation = useCreateCustomer();
  const updateQuote = useUpdateQuote();
  const { toast } = useToast();

  // Read pre-fill params from query string
  const params = new URLSearchParams(window.location.search);
  const quoteId = params.get('quoteId');
  const prefill: Partial<Customer> | undefined = (params.get('name') || params.get('email') || params.get('phone'))
    ? {
        name: params.get('name') ?? '',
        email: params.get('email') ?? null,
        phone: params.get('phone') ?? null,
      } as Partial<Customer>
    : undefined;

  function handleSubmit(data: CreateCustomerInput) {
    mutation.mutate(data, {
      onSuccess: async (res) => {
        const newId = (res as any)?.data?.id;
        if (quoteId && newId) {
          try {
            await updateQuote.mutateAsync({ id: quoteId, data: { customerId: newId } });
            toast('Customer created and linked to quote', 'success');
            navigate({ to: '/finance/ar/quotes' });
          } catch {
            toast('Customer created but failed to link to quote', 'error');
            navigate({ to: '/finance/ar/customers' });
          }
        } else {
          toast('Customer created successfully', 'success');
          navigate({ to: '/finance/ar/customers' });
        }
      },
      onError: () => {
        toast('Failed to create customer. Please try again.', 'error');
      },
    });
  }

  function handleCancel() {
    navigate({ to: quoteId ? '/finance/ar/quotes' : '/finance/ar/customers' });
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        breadcrumbs={[
          { label: 'AR', href: '/ar' },
          { label: 'Customers', href: '/ar/customers' },
          { label: 'New Customer' },
        ]}
        title={quoteId ? 'Onboard Customer from Quote' : 'New Customer'}
        description={quoteId ? 'Complete customer details to link with the quote.' : 'Add a new customer to your accounts receivable.'}
      />
      <CustomerForm
        initialData={prefill as Customer | undefined}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isLoading={mutation.isPending}
      />
    </div>
  );
}
