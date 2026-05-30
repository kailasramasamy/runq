import { useNavigate } from '@tanstack/react-router';
import { PageHeader } from '@/components/ui';
import { BomForm } from './_bom-form';
import { useCreateBom } from '@/hooks/queries/use-boms';
import type { CreateBomInput } from '@runq/validators';

export function NewBomPage() {
  const navigate = useNavigate();
  const mutation = useCreateBom();

  function handleSubmit(data: CreateBomInput) {
    mutation.mutate(data, {
      onSuccess: (res) => {
        const id = (res as { data?: { id?: string } })?.data?.id;
        if (id) navigate({ to: '/manufacturing/boms/$bomId', params: { bomId: id } });
        else navigate({ to: '/manufacturing/boms' });
      },
    });
  }

  return (
    <div>
      <PageHeader
        title="New BOM"
        description="Define the recipe: output item, output quantity, and input lines."
        breadcrumbs={[
          { label: 'Manufacturing', href: '/manufacturing' },
          { label: 'BOMs', href: '/manufacturing/boms' },
          { label: 'New' },
        ]}
      />
      <BomForm onSubmit={handleSubmit} isLoading={mutation.isPending} />
    </div>
  );
}
