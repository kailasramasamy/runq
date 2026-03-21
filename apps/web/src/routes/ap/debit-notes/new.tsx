import { useNavigate } from '@tanstack/react-router';
import { DebitNoteForm } from '../../../components/forms/debit-note-form';
import { useCreateDebitNote } from '../../../hooks/queries/use-debit-notes';
import { useToast, PageHeader } from '@/components/ui';
import type { CreateDebitNoteInput } from '@runq/validators';

export function NewDebitNotePage() {
  const navigate = useNavigate();
  const mutation = useCreateDebitNote();
  const { toast } = useToast();

  function handleSubmit(data: CreateDebitNoteInput) {
    mutation.mutate(data, {
      onSuccess: () => {
        toast('Debit note created successfully.', 'success');
        navigate({ to: '/ap/debit-notes' });
      },
      onError: () => {
        toast('Failed to create debit note. Please try again.', 'error');
      },
    });
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="New Debit Note"
        description="Raise a debit note against a vendor or invoice."
        breadcrumbs={[
          { label: 'AP', href: '/ap' },
          { label: 'Debit Notes', href: '/ap/debit-notes' },
          { label: 'New Debit Note' },
        ]}
      />
      <DebitNoteForm onSubmit={handleSubmit} isLoading={mutation.isPending} />
    </div>
  );
}
