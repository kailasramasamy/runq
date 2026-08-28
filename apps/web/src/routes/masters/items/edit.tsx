import { useState } from 'react';
import { useNavigate, useRouter, useRouterState } from '@tanstack/react-router';
import { ArrowLeft, Calculator, Copy, History } from 'lucide-react';
import {
  PageHeader,
  Card,
  CardContent,
  Button,
  ConfirmationDialog,
  useToast,
} from '@/components/ui';
import { useItem, useDeleteItem } from '@/hooks/queries/use-items';
import { ItemForm } from './item-form';
import { SubstitutesCard } from './substitutes-card';

export function ItemEditPage({
  itemId,
  duplicateOf,
}: {
  itemId?: string;
  duplicateOf?: string;
}) {
  const navigate = useNavigate();
  const router = useRouter();
  const { toast } = useToast();
  const remove = useDeleteItem();
  const { data, isLoading } = useItem(itemId);
  const item = data?.data;
  // When duplicating (no itemId, but a duplicateOf source), fetch the source
  // item to use as a template for the new item's initial form values.
  const { data: sourceData, isLoading: sourceLoading } = useItem(duplicateOf);
  const source = sourceData?.data;
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const isCreate = !itemId;
  const isDuplicate = isCreate && !!duplicateOf;
  // Prefer browser-history back so the list's URL-backed search/page filter
  // is preserved when returning from edit. Fall back to the bare list when
  // edit was opened directly (e.g. from a deep link).
  // List path is module-prefix aware so deep-linking into /purchase/items/new
  // (no browser history) doesn't bounce the user to Finance after save.
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const listPath = pathname.startsWith('/inventory')
    ? '/inventory/items'
    : pathname.startsWith('/purchase')
      ? '/purchase/items'
      : '/finance/masters/items';
  const goBack = () => {
    if (router.history.canGoBack()) router.history.back();
    else navigate({ to: listPath });
  };

  async function handleDelete() {
    if (!item) return;
    try {
      await remove.mutateAsync(item.id);
      toast('Item deleted', 'success');
      setConfirmingDelete(false);
      goBack();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Failed to delete item';
      toast(msg, 'error');
      setConfirmingDelete(false);
    }
  }

  // Edit mode but item not yet loaded
  if (!isCreate && (isLoading || !item)) {
    return (
      <div className="max-w-5xl">
        <PageHeader
          title="Edit Item"
          breadcrumbs={[{ label: 'Masters' }, { label: 'Items', href: '/masters/items' }, { label: 'Edit' }]}
        />
        <Card>
          <CardContent className="p-8 text-center text-zinc-400">Loading…</CardContent>
        </Card>
      </div>
    );
  }

  // Duplicate mode but source not yet loaded
  if (isDuplicate && (sourceLoading || !source)) {
    return (
      <div className="max-w-5xl">
        <PageHeader
          title="Duplicate Item"
          breadcrumbs={[{ label: 'Masters' }, { label: 'Items', href: '/masters/items' }, { label: 'Duplicate' }]}
        />
        <Card>
          <CardContent className="p-8 text-center text-zinc-400">Loading source item…</CardContent>
        </Card>
      </div>
    );
  }

  const headerTitle = isDuplicate
    ? `New Variant — copy of ${source!.name}`
    : isCreate
      ? 'New Item'
      : `Edit — ${item!.name}`;

  const headerDescription = isDuplicate
    ? 'Adjust the fields that differ for this variant (typically unit, MRP, EAN, SKU). Pricing & COGM breakdown are inherited and can be tuned in the calculator after save.'
    : isCreate
      ? 'Create a new product or service for invoices, bills, and price lists.'
      : (() => {
          const brand = item!.attributes?.brand as string | undefined;
          return `${brand ? brand + ' · ' : ''}${item!.unit ?? ''}${item!.ean ? ' · EAN ' + item!.ean : ''}`;
        })();

  return (
    <div className="max-w-5xl space-y-4">
      <PageHeader
        title={headerTitle}
        breadcrumbs={[
          { label: 'Masters' },
          { label: 'Items', href: '/masters/items' },
          { label: isDuplicate ? `Variant of ${source!.name}` : isCreate ? 'New' : item!.name },
        ]}
        description={headerDescription}
        actions={
          <div className="flex flex-wrap gap-2">
            {!isCreate && item!.trackInventory && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate({ to: `${listPath}/${item!.id}/movements` as never })}
              >
                <History size={14} /> Stock Movements
              </Button>
            )}
            {!isCreate && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  navigate({
                    to: '/finance/masters/items/$itemId/analysis',
                    params: { itemId: item!.id },
                    search: { from: 'edit' },
                  })
                }
              >
                <Calculator size={14} /> Cost & Profit Analysis
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={goBack}>
              <ArrowLeft size={14} /> Back to Items
            </Button>
          </div>
        }
      />

      {isDuplicate && source && (
        <div className="flex items-start gap-2 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300">
          <Copy size={14} className="mt-0.5 shrink-0" />
          <p>
            Duplicating from <strong>{source.name}</strong>. SKU and EAN have been
            cleared (they must be unique per item) and the name has a "(Copy)" suffix.
            Adjust whatever differs for this variant — pricing, COGM breakdown, brand,
            category, etc. are all inherited from the source.
          </p>
        </div>
      )}

      <Card>
        <CardContent className="pt-5">
          <ItemForm
            key={item?.id ?? duplicateOf ?? 'new'}
            item={item ?? undefined}
            template={isDuplicate ? source ?? undefined : undefined}
            onClose={goBack}
            onDelete={isCreate ? undefined : () => setConfirmingDelete(true)}
            onOpenAnalysis={
              isCreate
                ? undefined
                : () =>
                    navigate({
                      to: '/finance/masters/items/$itemId/analysis',
                      params: { itemId: item!.id },
                      search: { from: 'edit' },
                    })
            }
          />
        </CardContent>
      </Card>

      {/* Only on a saved, stocked item: substitutes are a relationship
          between two existing items, with their own endpoint. */}
      {!isCreate && item!.trackInventory && (
        <SubstitutesCard itemId={item!.id} itemName={item!.name} />
      )}

      <ConfirmationDialog
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        onConfirm={handleDelete}
        title="Delete item?"
        description={
          item
            ? `"${item.name}" will be permanently deleted. This cannot be undone. If the item is referenced by a price list, deletion will be blocked.`
            : ''
        }
        confirmLabel="Delete"
        variant="danger"
        loading={remove.isPending}
      />
    </div>
  );
}
