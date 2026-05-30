import { useNavigate } from '@tanstack/react-router';
import { CreditNoteForm } from '../../../components/forms/credit-note-form';
import { useCreateCustomerDebitNote } from '../../../hooks/queries/use-customer-debit-notes';
import { useToast, PageHeader } from '@/components/ui';
import type { CreateCustomerDebitNoteInput, CreateCreditNoteInput } from '@runq/validators';

// Customer debit notes reuse the credit-note form (identical input shape
// per validators) with relabelled copy. Both create one document with line
// items + tax breakdown; only the direction (debit vs credit) and the
// downstream service differ.
export function NewCustomerDebitNotePage() {
  const navigate = useNavigate();
  const mutation = useCreateCustomerDebitNote();
  const { toast } = useToast();

  function handleSubmit(data: CreateCreditNoteInput) {
    mutation.mutate(data as unknown as CreateCustomerDebitNoteInput, {
      onSuccess: () => {
        toast('Debit note created successfully.', 'success');
        navigate({ to: '/finance/ar/customer-debit-notes' });
      },
      onError: () => {
        toast('Failed to create debit note. Please check your inputs and try again.', 'error');
      },
    });
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="New Customer Debit Note"
        description="Raise an additional charge on a customer — e.g. for an under-billed invoice or a post-invoice correction."
        breadcrumbs={[
          { label: 'AR', href: '/ar' },
          { label: 'Customer Debit Notes', href: '/ar/customer-debit-notes' },
          { label: 'New' },
        ]}
      />
      <CreditNoteForm
        onSubmit={handleSubmit}
        isLoading={mutation.isPending}
        docLabel={{ title: 'Customer Debit Note Details', submitButton: 'Save Debit Note' }}
      />
    </div>
  );
}
