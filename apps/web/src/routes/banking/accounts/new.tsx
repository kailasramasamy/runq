import { useNavigate } from '@tanstack/react-router';
import { BankAccountForm } from '@/components/forms/bank-account-form';
import { useCreateBankAccount } from '@/hooks/queries/use-bank-accounts';
import { useToast } from '@/components/ui';
import type { CreateBankAccountInput } from '@runq/validators';
import { PageHeader } from '@/components/ui';

export function NewBankAccountPage() {
  const navigate = useNavigate();
  const mutation = useCreateBankAccount();
  const { toast } = useToast();

  function handleSubmit(data: CreateBankAccountInput) {
    mutation.mutate(data, {
      onSuccess: () => {
        toast('Bank account created successfully.', 'success');
        navigate({ to: '/banking/accounts' });
      },
      onError: () => {
        toast('Failed to create bank account. Please check your inputs and try again.', 'error');
      },
    });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="New Bank Account"
        description="Link a bank account to start tracking transactions."
        breadcrumbs={[
          { label: 'Banking', href: '/banking' },
          { label: 'Accounts', href: '/banking/accounts' },
          { label: 'New Account' },
        ]}
      />
      <BankAccountForm onSubmit={handleSubmit} isLoading={mutation.isPending} />
    </div>
  );
}
