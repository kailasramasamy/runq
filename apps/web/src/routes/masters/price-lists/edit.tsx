import { useNavigate } from '@tanstack/react-router';
import { usePriceList } from '@/hooks/queries/use-price-lists';
import { PriceListForm } from '../price-lists';
import { PageHeader, CardSkeleton } from '@/components/ui';

export function PriceListEditPage({ priceListId }: { priceListId: string }) {
  const navigate = useNavigate();
  const { data, isLoading } = usePriceList(priceListId);
  const pl = data?.data ?? null;

  function handleClose() {
    navigate({ to: '/masters/price-lists/$priceListId', params: { priceListId } });
  }

  if (isLoading) {
    return (
      <div>
        <PageHeader
          title="Edit Price List"
          breadcrumbs={[
            { label: 'Masters' },
            { label: 'Price Lists', path: '/masters/price-lists' },
            { label: '…' },
          ]}
        />
        <CardSkeleton />
      </div>
    );
  }

  if (!pl) {
    return (
      <div>
        <PageHeader
          title="Edit Price List"
          breadcrumbs={[
            { label: 'Masters' },
            { label: 'Price Lists', path: '/masters/price-lists' },
            { label: 'Not Found' },
          ]}
        />
        <p className="text-sm text-zinc-500">Price list not found.</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={`Edit — ${pl.name}`}
        breadcrumbs={[
          { label: 'Masters' },
          { label: 'Price Lists', path: '/masters/price-lists' },
          { label: pl.name, path: `/masters/price-lists/${priceListId}` },
          { label: 'Edit' },
        ]}
      />
      <PriceListForm priceList={pl} onClose={handleClose} />
    </div>
  );
}
