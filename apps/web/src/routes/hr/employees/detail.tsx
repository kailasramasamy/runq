import { useNavigate } from '@tanstack/react-router';
import { PageHeader, useToast } from '@/components/ui';
import { EmployeeForm } from '@/components/forms/employee-form';
import { useEmployee, useUpdateEmployee } from '@/hooks/queries/use-hr';

interface Props { employeeId: string }

export function EmployeeDetailPage({ employeeId }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data, isLoading } = useEmployee(employeeId);
  const mutation = useUpdateEmployee();

  if (isLoading) return <div className="p-6 text-sm" style={{ color: 'var(--text-3)' }}>Loading…</div>;
  const employee = data?.data;
  if (!employee) return <div className="p-6 text-sm" style={{ color: 'var(--text-3)' }}>Employee not found.</div>;

  const name = `${employee.firstName}${employee.lastName ? ' ' + employee.lastName : ''}`;

  function handleSubmit(input: any) {
    mutation.mutate({ id: employeeId, ...input }, {
      onSuccess: () => toast('Employee updated', 'success'),
      onError: (e: any) => toast(e?.message ?? 'Failed to update', 'error'),
    });
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        breadcrumbs={[
          { label: 'HR', href: '/hr' },
          { label: 'Employees', href: '/hr/employees' },
          { label: name },
        ]}
        title={name}
        description={`Code: ${employee.employeeCode} · Joined ${employee.joiningDate}`}
      />
      <EmployeeForm
        initialData={employee}
        onSubmit={handleSubmit}
        onCancel={() => navigate({ to: '/hr/employees' })}
        isLoading={mutation.isPending}
      />
    </div>
  );
}
