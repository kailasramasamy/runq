import { useNavigate } from '@tanstack/react-router';
import { PageHeader, useToast } from '@/components/ui';
import { EmployeeForm } from '@/components/forms/employee-form';
import { useCreateEmployee } from '@/hooks/queries/use-hr';

export function NewEmployeePage() {
  const navigate = useNavigate();
  const mutation = useCreateEmployee();
  const { toast } = useToast();

  function handleSubmit(data: any) {
    mutation.mutate(data, {
      onSuccess: () => {
        toast('Employee created', 'success');
        navigate({ to: '/hr/employees' });
      },
      onError: (e: any) => toast(e?.message ?? 'Failed to create employee', 'error'),
    });
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        breadcrumbs={[
          { label: 'HR', href: '/hr' },
          { label: 'Employees', href: '/hr/employees' },
          { label: 'New' },
        ]}
        title="New employee"
        description="Add a new employee with statutory and bank details."
      />
      <EmployeeForm
        onSubmit={handleSubmit}
        onCancel={() => navigate({ to: '/hr/employees' })}
        isLoading={mutation.isPending}
      />
    </div>
  );
}
