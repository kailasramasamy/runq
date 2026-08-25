import { useNavigate } from '@tanstack/react-router';
import { PageHeader, CardSkeleton } from '@/components/ui';
import { BomForm } from './_bom-form';
import { useBom, useUpdateBom } from '@/hooks/queries/use-boms';
import type { CreateBomInput } from '@runq/validators';

interface Props { bomId: string }

export function EditBomPage({ bomId }: Props) {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useBom(bomId);
  const mutation = useUpdateBom();

  const bom = data?.data;

  function handleSubmit(input: CreateBomInput) {
    // Strip bomCode from input since update schema strips it
    const { bomCode: _unused, ...rest } = input as CreateBomInput & { bomCode?: string };
    mutation.mutate(
      { id: bomId, data: rest },
      {
        onSuccess: () =>
          navigate({ to: '/manufacturing/boms/$bomId', params: { bomId } }),
      },
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-4xl space-y-4">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }
  if (isError || !bom) {
    return <p className="text-sm text-red-500">BOM not found.</p>;
  }

  return (
    <div>
      <PageHeader
        title={`Edit ${bom.bomCode}`}
        description="Update the recipe definition."
        breadcrumbs={[
          { label: 'Manufacturing', href: '/manufacturing' },
          { label: 'BOMs', href: '/manufacturing/boms' },
          { label: bom.bomCode, href: `/manufacturing/boms/${bomId}` },
          { label: 'Edit' },
        ]}
      />
      <BomForm
        initial={bom}
        onSubmit={handleSubmit}
        isLoading={mutation.isPending}
      />
    </div>
  );
}
