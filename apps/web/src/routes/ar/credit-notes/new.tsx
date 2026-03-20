import { useNavigate } from '@tanstack/react-router';
import { CreditNoteForm } from '../../../components/forms/credit-note-form';
import { useCreateCreditNote } from '../../../hooks/queries/use-credit-notes';
import { useToast, PageHeader } from '@/components/ui';
import type { CreateCreditNoteInput } from '@runq/validators';

export function NewCreditNotePage() {
  const navigate = useNavigate();
  const mutation = useCreateCreditNote();
  const { toast } = useToast();

  function handleSubmit(data: CreateCreditNoteInput) {
    mutation.mutate(data, {
      onSuccess: () => {
        toast('Credit note created successfully.', 'success');
        navigate({ to: '/ar/credit-notes' });
      },
      onError: () => {
        toast('Failed to create credit note. Please check your inputs and try again.', 'error');
      },
    });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="New Credit Note"
        description="Issue a credit note to adjust a customer's account or invoice."
        breadcrumbs={[
          { label: 'AR', href: '/ar' },
          { label: 'Credit Notes', href: '/ar/credit-notes' },
          { label: 'New Credit Note' },
        ]}
      />
      <CreditNoteForm onSubmit={handleSubmit} isLoading={mutation.isPending} />
    </div>
  );
}
