import { useNavigate } from '@tanstack/react-router';
import { PageHeader } from '@/components/ui';
import { WoForm } from './_wo-form';
import { useCreateWorkOrder } from '@/hooks/queries/use-work-orders';
import type { CreateWorkOrderInput } from '@runq/validators';

export function NewWorkOrderPage() {
  const navigate = useNavigate();
  const mutation = useCreateWorkOrder();

  function handleSubmit(data: CreateWorkOrderInput) {
    mutation.mutate(data, {
      onSuccess: (res) => {
        const id = (res as { data?: { id?: string } })?.data?.id;
        if (id) navigate({ to: '/manufacturing/wos/$woId', params: { woId: id } });
        else navigate({ to: '/manufacturing/wos' });
      },
    });
  }

  return (
    <div>
      <PageHeader
        title="New Work Order"
        description="Schedule a production run against a BOM."
        breadcrumbs={[
          { label: 'Manufacturing', href: '/manufacturing' },
          { label: 'Work Orders', href: '/manufacturing/wos' },
          { label: 'New' },
        ]}
      />
      <WoForm onSubmit={handleSubmit} isLoading={mutation.isPending} />
    </div>
  );
}
