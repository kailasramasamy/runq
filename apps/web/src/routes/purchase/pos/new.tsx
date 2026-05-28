import { useNavigate } from '@tanstack/react-router';
import { PageHeader } from '@/components/ui';
import { PoForm } from '@/components/forms/po-form';
import { useCreatePurchaseOrder } from '@/hooks/queries/use-purchase-orders';
import type { CreatePurchaseOrderInput } from '@runq/validators';

export function NewPurchaseOrderPage() {
  const navigate = useNavigate();
  const mutation = useCreatePurchaseOrder();

  function handleSubmit(data: CreatePurchaseOrderInput) {
    mutation.mutate(data, {
      onSuccess: (res) => {
        const id = (res as { data?: { id?: string } })?.data?.id;
        if (id) navigate({ to: '/purchase/pos/$poId', params: { poId: id } });
        else navigate({ to: '/purchase/pos' });
      },
    });
  }

  return (
    <div>
      <PageHeader
        title="New Purchase Order"
        description="Commit to a vendor for one or more line items."
        breadcrumbs={[
          { label: 'Purchase', href: '/purchase' },
          { label: 'Purchase Orders', href: '/purchase/pos' },
          { label: 'New' },
        ]}
      />
      <PoForm onSubmit={handleSubmit} isLoading={mutation.isPending} />
    </div>
  );
}
