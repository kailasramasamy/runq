import { useNavigate } from '@tanstack/react-router';
import { PageHeader, CardSkeleton } from '@/components/ui';
import { WoForm } from './_wo-form';
import { useWorkOrder, useUpdateWorkOrder } from '@/hooks/queries/use-work-orders';
import type { CreateWorkOrderInput } from '@runq/validators';

interface Props { woId: string }

export function EditWorkOrderPage({ woId }: Props) {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useWorkOrder(woId);
  const mutation = useUpdateWorkOrder();

  const wo = data?.data;

  function handleSubmit(input: CreateWorkOrderInput) {
    mutation.mutate(
      { id: woId, data: input },
      {
        onSuccess: () =>
          navigate({ to: '/manufacturing/wos/$woId', params: { woId } }),
      },
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-3xl space-y-4">
        <CardSkeleton />
      </div>
    );
  }
  if (isError || !wo) {
    return <p className="text-sm text-red-500">Work order not found.</p>;
  }
  if (wo.status !== 'draft') {
    return (
      <div className="rounded-lg border px-4 py-3 text-[13px]" style={{ borderColor: 'var(--border)' }}>
        Work order {wo.woNumber} is in <strong>{wo.status}</strong> status and can no longer be edited.
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={`Edit ${wo.woNumber}`}
        description="Draft work orders only — edits are not allowed once started."
        breadcrumbs={[
          { label: 'Manufacturing', href: '/manufacturing' },
          { label: 'Work Orders', href: '/manufacturing/wos' },
          { label: wo.woNumber, href: `/manufacturing/wos/${woId}` },
          { label: 'Edit' },
        ]}
      />
      <WoForm initial={wo} onSubmit={handleSubmit} isLoading={mutation.isPending} />
    </div>
  );
}
